// @vitest-environment node
// (jsdom's TextEncoder hands back a Uint8Array from another realm, which the zip writer's
// `instanceof` check rejects; a real browser has one realm, as Node does.)
/**
 * downloadAllRun — the plan, made into one zip: streamed files, made files, text files and
 * the README, at the paths the plan gave them; a group left out stays out.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/dataApi', () => ({
  resolveUrls: vi.fn(async (keys: string[]) =>
    Object.fromEntries(keys.filter((k) => !k.includes('denied')).map((k) => [k, `https://r2.test/${k}`]))),
  readMarkdown: vi.fn(),
}))

import { buildBundlePlan, type BundleGroupId, type BundleMaker } from '@/lib/downloadAll'
import { runDownloadAll, zipItemsForPlan } from '@/lib/downloadAllRun'
import { ROOT, cast, choices, figure, fullComic, threads } from '@/lib/__tests__/downloadAll.fixture'

let saved: Blob | null = null

beforeEach(() => {
  saved = null
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('page-03')) return new Response('gone', { status: 404 })
    return new Response(new TextEncoder().encode(`bytes of ${u.split('/').pop()}`))
  }) as typeof fetch
})

async function unzip(): Promise<Record<string, string>> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await saved!.arrayBuffer())
  const out: Record<string, string> = {}
  for (const name of Object.keys(zip.files)) if (!zip.files[name].dir) out[name] = await zip.files[name].async('string')
  return out
}

const fakeMake = async (m: BundleMaker) => new TextEncoder().encode(`made ${JSON.stringify(m)}`)

describe('runDownloadAll', () => {
  const comic = fullComic()
  const ctx = { figure: figure(), cast: cast(), threads, coverChoices: choices }
  const plan = buildBundlePlan(comic, ctx)

  test('every chosen file lands at its planned path, with the README last saying what failed', async () => {
    const selected = new Set<BundleGroupId>(plan.groups.map((g) => g.id).filter((id) => id !== 'indesignTrim'))
    const result = await runDownloadAll({ comic, plan, ctx, selected, make: fakeMake, noPicker: true, sink: (b) => { saved = b }, today: '2026-10-21' })
    const files = await unzip()

    expect(result.cancelled).toBe(false)
    expect(result.failed).toEqual([`${ROOT}/01 Comic/Page images/Page 03.jpg`])
    // Streamed from R2
    expect(files[`${ROOT}/01 Comic/Page images/Page 01.jpg`]).toBe('bytes of page-01.jpg')
    expect(files[`${ROOT}/03 Editable files/InDesign/${ROOT} — English only.zip`]).toBe('bytes of 01-the-long-road-indesign.zip')
    // Made in the browser
    expect(files[`${ROOT}/01 Comic/${ROOT} — full resolution.pdf`]).toBe('made {"kind":"comic-pdf","variant":"full"}')
    expect(files[`${ROOT}/08 Research/Transcripts/A Talk.md`]).toBe('made {"kind":"research-md","sourceSlug":"a-talk"}')
    // Written as text
    expect(files[`${ROOT}/09 History and comments/Comments.txt`]).toContain('Is this the right town?')
    // Left out
    expect(Object.keys(files).some((p) => p.includes('6.25 × 9 in'))).toBe(false)
    // The README
    const readme = files[`${ROOT}/README.txt`]
    expect(readme).toContain('COULD NOT BE FETCHED')
    expect(readme).toContain('01 Comic/Page images/Page 03.jpg')
    expect(readme).toContain('Left out when this was downloaded:')
    expect(readme).toContain('Downloaded  21 October 2026')
    // Nothing in the zip that the plan did not name (plus the README)
    const planned = new Set(plan.groups.filter((g) => selected.has(g.id)).flatMap((g) => g.items.map((i) => i.path)))
    planned.add(`${ROOT}/README.txt`)
    for (const p of Object.keys(files)) expect(planned.has(p)).toBe(true)
  })

  test('a file whose builder throws is reported, and the rest of the zip still arrives', async () => {
    const selected = new Set<BundleGroupId>(['comic', 'history'])
    const make = async (m: BundleMaker) => {
      if (m.kind === 'comic-pdf' && m.variant === 'watermarked') throw new Error('no canvas')
      return fakeMake(m)
    }
    const result = await runDownloadAll({ comic, plan, ctx, selected, make, noPicker: true, sink: (b) => { saved = b } })
    const files = await unzip()
    const marked = `${ROOT}/01 Comic/${ROOT} — low resolution, watermarked.pdf`
    expect(result.failed).toContain(marked)
    expect(files[marked]).toBeUndefined()
    expect(files[`${ROOT}/01 Comic/${ROOT} — low resolution.pdf`]).toBeDefined()
    expect(files[`${ROOT}/README.txt`]).toContain('could not be fetched')
  })

  test('zip items follow the plan: keys stream, text is written, made files are deferred', () => {
    const items = zipItemsForPlan(plan, new Set<BundleGroupId>(['comic', 'history']), fakeMake)
    expect(items.filter((i) => i.key).length).toBeGreaterThan(0)
    expect(items.filter((i) => i.text !== undefined).map((i) => i.path)).toEqual([
      `${ROOT}/09 History and comments/Version history and corrections.txt`,
      `${ROOT}/09 History and comments/Comments.txt`,
    ])
    expect(items.filter((i) => i.data).length).toBe(3)
    expect(items.every((i) => i.path.startsWith(`${ROOT}/01 Comic/`) || i.path.startsWith(`${ROOT}/09 `))).toBe(true)
  })
})

// @vitest-environment node
// (jsdom's TextEncoder hands back a Uint8Array from another realm, which the zip
// writer's `instanceof` check rejects; a real browser has one realm, as Node does.)
/**
 * downloads — file names every OS accepts, and a zip that streams what it fetched.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('@/lib/dataApi', () => ({
  resolveUrls: vi.fn(async (keys: string[]) => Object.fromEntries(keys.filter((k) => !k.includes('denied')).map((k) => [k, `https://r2.test/${k}`]))),
}))

import { downloadZip, formatBytes, safeFilename, uniquePaths } from '@/lib/downloads'

describe('names', () => {
  test('keeps diacritics and drops what file systems refuse', () => {
    expect(safeFilename('Rāmāyaṇa: Sītā / “Bride”?')).toBe('Rāmāyaṇa Sītā “Bride”')
    expect(safeFilename('  ..hidden.. ')).toBe('hidden')
    expect(safeFilename('')).toBe('untitled')
    expect(safeFilename('a'.repeat(300)).length).toBe(120)
  })

  test('duplicate paths get a number before the extension', () => {
    expect(uniquePaths(['A/x.png', 'A/X.png', 'A/x.png', 'B'])).toEqual(['A/x.png', 'A/X (2).png', 'A/x (3).png', 'B'])
  })

  test('sizes read like sizes', () => {
    expect(formatBytes(0)).toBe('0 KB')
    expect(formatBytes(1500)).toBe('2 KB')
    expect(formatBytes(3_400_000)).toBe('3.4 MB')
    expect(formatBytes(412_000_000)).toBe('412 MB')
    expect(formatBytes(2_100_000_000)).toBe('2.10 GB')
  })
})

describe('downloadZip', () => {
  let saved: Blob | null
  beforeEach(() => {
    saved = null
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('missing')) return new Response('nope', { status: 404 })
      return new Response(new TextEncoder().encode(`bytes of ${u.split('/').pop()}`))
    }) as typeof fetch
  })

  async function zipped(): Promise<Record<string, string>> {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(await saved!.arrayBuffer())
    const out: Record<string, string> = {}
    for (const name of Object.keys(zip.files)) out[name] = await zip.files[name].async('string')
    return out
  }

  test('fetches every key in order, writes the README last, and reports what failed', async () => {
    const result = await downloadZip('Work — characters', [
      { path: 'Work/Rāma/Rāma — Boy.png', key: 'artifacts/characters/indic/rama/rama-boy.png', bytes: 10 },
      { path: 'Work/Sita/Sita — Main look.png', key: 'artifacts/characters/indic/sita/missing.png' },
      { path: 'Work/Hidden.png', key: 'artifacts/denied.png' },
    ], {
      noPicker: true,
      sink: (b) => { saved = b },
      readme: (failed) => `# README\n${failed.join('\n')}`,
      readmePath: 'Work/README.md',
    })
    expect(result.cancelled).toBe(false)
    expect(result.failed.sort()).toEqual(['Work/Hidden.png', 'Work/Sita/Sita — Main look.png'])
    const files = await zipped()
    expect(files['Work/Rāma/Rāma — Boy.png']).toBe('bytes of rama-boy.png')
    expect(files['Work/README.md']).toContain('Work/Hidden.png')
    expect(Object.keys(files)).not.toContain('Work/Hidden.png')
  })

  test('bytes made while the zip streams (the PDF) go in after the sheets', async () => {
    await downloadZip('W', [
      { path: 'W/a.png', key: 'artifacts/characters/x/a/a.png' },
      { path: 'W/W — characters.pdf', data: async () => new TextEncoder().encode('%PDF-test') },
    ], { noPicker: true, sink: (b) => { saved = b } })
    const files = await zipped()
    expect(files['W/W — characters.pdf']).toBe('%PDF-test')
    expect(files['W/a.png']).toBe('bytes of a.png')
  })
})

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

import { createPresigner, downloadZip, formatBytes, PRESIGN_FRESH_MS, safeFilename, uniquePaths } from '@/lib/downloads'

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
    expect(saved!.type).toBe('application/zip')
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

  test('the README is told how many bytes each file wrote, and progress names the file under way', async () => {
    const seen: string[] = []
    let sizes: Record<string, number> = {}
    const result = await downloadZip('W', [
      { path: 'W/a.png', key: 'artifacts/comics/x/a.png' },
      { path: 'W/made.pdf', data: async () => new Uint8Array(7) },
      { path: 'W/notes.txt', text: 'héllo' },
    ], {
      noPicker: true,
      sink: (b) => { saved = b },
      onProgress: (p) => { if (p.current && !seen.includes(p.current)) seen.push(p.current) },
      readme: (_failed, written) => { sizes = written; return 'R' },
    })
    expect(sizes['W/a.png']).toBe('bytes of a.png'.length)
    expect(sizes['W/made.pdf']).toBe(7)
    expect(sizes['W/notes.txt']).toBe(6) // é is two bytes in UTF-8
    expect(result.written).toEqual(sizes)
    expect(seen).toEqual(['W/a.png', 'W/made.pdf', 'W/notes.txt'])
  })

  test('a body waiting its turn is locked at once, so it cannot be cancelled before the zip reaches it', async () => {
    // Node's fetch cancels an unread, UNLOCKED body when its Response is garbage-collected;
    // the zip reads bodies one at a time, so a body further down the window used to arrive
    // empty. Mimic it: any body still unlocked a moment after it is handed over is cancelled.
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const bytes = new TextEncoder().encode(`bytes of ${String(url).split('/').pop()}`)
      const body = new ReadableStream<Uint8Array>({
        start(c) { setTimeout(() => { c.enqueue(bytes); c.close() }, 5) },
      })
      setTimeout(() => { if (!body.locked) void body.cancel('collected') }, 0)
      return new Response(body, { headers: { 'content-length': String(bytes.byteLength) } })
    }) as typeof fetch
    const items = Array.from({ length: 8 }, (_, i) => ({ path: `W/${i}.png`, key: `artifacts/comics/x/${i}.png` }))
    const result = await downloadZip('W', items, { noPicker: true, sink: (b) => { saved = b } })
    const files = await zipped()
    expect(result.failed).toEqual([])
    for (let i = 0; i < 8; i++) expect(files[`W/${i}.png`]).toBe(`bytes of ${i}.png`)
  })

  test('a body that ends short of its Content-Length is reported, never passed off as whole', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(new TextEncoder().encode('half'), { headers: { 'content-length': '100' } })) as typeof fetch
    let failedInReadme: string[] = []
    const result = await downloadZip('W', [{ path: 'W/a.png', key: 'artifacts/comics/x/a.png' }], {
      noPicker: true,
      sink: (b) => { saved = b },
      readme: (failed) => { failedInReadme = failed; return 'R' },
    })
    expect(result.failed).toEqual(['W/a.png'])
    expect(failedInReadme).toEqual(['W/a.png'])
  })

  test('a body longer than its Content-Length (text R2 sent gzipped) is whole, not failed', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(new TextEncoder().encode('# a long decoded markdown file'), { headers: { 'content-length': '12' } })) as typeof fetch
    const result = await downloadZip('W', [{ path: 'W/a.md', key: 'docs/x/a.md' }], { noPicker: true, sink: (b) => { saved = b } })
    expect(result.failed).toEqual([])
    expect((await zipped())['W/a.md']).toBe('# a long decoded markdown file')
  })

  test('a refused signature is signed again once and retried', async () => {
    const { resolveUrls } = await import('@/lib/dataApi')
    let calls = 0
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      calls += 1
      // The first URL handed out has expired by the time it is used.
      return calls === 1
        ? new Response('expired', { status: 403 })
        : new Response(new TextEncoder().encode(`bytes of ${String(url).split('/').pop()}`))
    }) as typeof fetch
    vi.mocked(resolveUrls).mockClear()
    const result = await downloadZip('W', [{ path: 'W/a.png', key: 'artifacts/comics/x/a.png' }], {
      noPicker: true,
      sink: (b) => { saved = b },
    })
    expect(result.failed).toEqual([])
    expect(vi.mocked(resolveUrls)).toHaveBeenCalledTimes(2)
    expect((await zipped())['W/a.png']).toBe('bytes of a.png')
  })
})

describe('createPresigner', () => {
  test('signs in batches of at most 50, starting at the key asked for', async () => {
    const keys = Array.from({ length: 120 }, (_, i) => `images/k${i}.jpg`)
    const batches: string[][] = []
    const p = createPresigner(keys, {
      resolve: async (ks) => { batches.push(ks); return Object.fromEntries(ks.map((k) => [k, `u:${k}`])) },
    })
    expect(await p.url('images/k0.jpg')).toBe('u:images/k0.jpg')
    expect(await p.url('images/k49.jpg')).toBe('u:images/k49.jpg') // came with the first batch
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(50)
    expect(await p.url('images/k50.jpg')).toBe('u:images/k50.jpg')
    expect(batches).toHaveLength(2)
    expect(batches[1][0]).toBe('images/k50.jpg')
  })

  test('callers waiting on the same batch share one request', async () => {
    let requests = 0
    const p = createPresigner(['a', 'b', 'c'], {
      resolve: async (ks) => { requests += 1; return Object.fromEntries(ks.map((k) => [k, `u:${k}`])) },
    })
    const urls = await Promise.all([p.url('a'), p.url('b'), p.url('c')])
    expect(urls).toEqual(['u:a', 'u:b', 'u:c'])
    expect(requests).toBe(1)
  })

  test('a URL older than the freshness window is signed again (they expire after ten minutes)', async () => {
    let t = 0
    let n = 0
    const p = createPresigner(['a'], {
      now: () => t,
      resolve: async (ks) => { n += 1; return Object.fromEntries(ks.map((k) => [k, `u${n}:${k}`])) },
    })
    expect(await p.url('a')).toBe('u1:a')
    t = PRESIGN_FRESH_MS - 1
    expect(await p.url('a')).toBe('u1:a')
    t = PRESIGN_FRESH_MS + 1
    expect(await p.url('a')).toBe('u2:a')
    expect(await p.url('a', { force: true })).toBe('u3:a')
  })

  test('a key the gate refuses comes back null; a failed request rejects', async () => {
    const p = createPresigner(['ok', 'denied'], {
      resolve: async (ks) => Object.fromEntries(ks.filter((k) => k !== 'denied').map((k) => [k, `u:${k}`])),
    })
    expect(await p.url('denied')).toBeNull()
    const broken = createPresigner(['x'], { resolve: async () => { throw new Error('resolve failed: 500') } })
    await expect(broken.url('x')).rejects.toThrow('resolve failed')
  })
})

'use client'

/**
 * downloads.ts — getting gated files onto the viewer's disk, quickly.
 *
 * Three shapes, one module:
 *
 *   ONE FILE      `downloadKey` presigns the key WITH a filename, so R2 answers with
 *                 `Content-Disposition: attachment`, then follows a hidden link to it.
 *                 The browser streams it to disk itself: no blob in memory, no extra
 *                 hop, R2's free egress. (A plain presigned link only OPENS an image,
 *                 because the `download` attribute is ignored across origins.)
 *
 *   MANY FILES    `downloadZip` builds a zip as a stream while the files are still
 *                 arriving, six fetches in flight. PNG sheets are already compressed,
 *                 so the zip stores them as they are (client-zip, STORE). Where the
 *                 browser has the File System Access API (Chrome, Edge) the stream is
 *                 written straight to the file the viewer picked, so a 600 MB cast
 *                 never sits in memory; elsewhere it is collected into a Blob first.
 *
 *   GENERATED     `saveText` / `saveBlob` for a README or a source assembled here.
 *
 * Nothing here holds data in the public bundle: every byte comes through the gated
 * presign in `dataApi.ts`.
 */

import { resolveUrls } from '@/lib/dataApi'

// ─── names ────────────────────────────────────────────────────────────────────

/**
 * A filename every OS accepts, keeping the letters people actually use — `Rāmāyaṇa`
 * and `Sītā` survive; `/ \ : * ? " < > |` and control characters do not.
 */
/** Inside a zip: Windows' built-in unzip refuses a path over 260 characters, so a
 *  folder name stays under 60 and a file name under 80. */
export const ZIP_FOLDER_MAX = 60
export const ZIP_FILE_MAX = 80

export function safeFilename(name: string, fallback = 'untitled', max = 120): string {
  const cleaned = (name ?? '')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
  const capped = cleaned.length > max ? cleaned.slice(0, max).replace(/[.\s]+$/, '') : cleaned
  return capped || fallback
}

/** `name.png` with the stem made safe and the extension kept. */
export function safeFile(stem: string, ext: string, fallback = 'untitled'): string {
  const e = ext.startsWith('.') ? ext : `.${ext}`
  return `${safeFilename(stem, fallback)}${e}`
}

/** `Rama` + `Rama (2)` … so two entries never land on one path inside a zip. */
export function uniquePaths(paths: string[]): string[] {
  const seen = new Map<string, number>()
  return paths.map((p) => {
    const lower = p.toLowerCase()
    const n = (seen.get(lower) ?? 0) + 1
    seen.set(lower, n)
    if (n === 1) return p
    const dot = p.lastIndexOf('.')
    const slash = p.lastIndexOf('/')
    return dot > slash ? `${p.slice(0, dot)} (${n})${p.slice(dot)}` : `${p} (${n})`
  })
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 KB'
  if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))} KB`
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`
  return `${(n / 1e9).toFixed(2)} GB`
}

// ─── one file ─────────────────────────────────────────────────────────────────

/** Save a Blob under `filename` (a same-origin object URL, so `download` is honoured). */
export function saveBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next turn: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(href), 30_000)
}

export function saveText(text: string, filename: string, type = 'text/markdown;charset=utf-8'): void {
  saveBlob(new Blob([text], { type }), filename)
}

/** Navigate a hidden link: the response's own attachment header does the rest. */
export function followDownloadUrl(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Presign one key as an attachment called `filename`, and download it. */
export async function downloadKey(key: string, filename: string): Promise<void> {
  const urls = await resolveUrls([key], { download: { [key]: filename } })
  const url = urls[key]
  if (!url) throw new Error('This file is not available to you.')
  followDownloadUrl(url)
}

// ─── many files, as a zip ─────────────────────────────────────────────────────

export interface ZipItem {
  /** Path inside the zip, `Folder/File.png`. */
  path: string
  /** An R2 key to fetch, or… */
  key?: string
  /** …text written into the zip directly (a README). */
  text?: string
  /** Expected size, for the progress total. */
  bytes?: number
}

export interface ZipProgress {
  done: number
  total: number
  bytesDone: number
  bytesTotal: number
}

export interface ZipResult {
  /** Paths that could not be fetched (listed in the README by the caller). */
  failed: string[]
  cancelled: boolean
  /** True when the stream went straight to disk (File System Access API). */
  streamedToDisk: boolean
}

interface SaveHandle {
  createWritable: () => Promise<WritableStream<Uint8Array> & { abort?: () => Promise<void> }>
}

type Picker = (opts: unknown) => Promise<SaveHandle>

function savePicker(): Picker | null {
  const w = globalThis as unknown as { showSaveFilePicker?: Picker }
  return typeof w.showSaveFilePicker === 'function' ? w.showSaveFilePicker.bind(globalThis) : null
}

/**
 * Stream a zip of `items` to disk.
 *
 * CALL IT STRAIGHT FROM THE CLICK, before any other `await`: the save dialog needs the
 * click's user activation, and a network round-trip first can use it up.
 *
 * `readme`, when given, is called last with the paths that failed, so the README in
 * the zip can say honestly what is missing.
 */
export async function downloadZip(
  name: string,
  items: ZipItem[],
  opts: {
    onProgress?: (p: ZipProgress) => void
    signal?: AbortSignal
    concurrency?: number
    readme?: (failed: string[]) => string
    /** Where the README goes inside the zip (default `README.md` at the root). */
    readmePath?: string
    /** Test seam: skip the save dialog. */
    noPicker?: boolean
    /** Test seam: receive the finished Blob instead of saving it. */
    sink?: (blob: Blob, filename: string) => void
  } = {},
): Promise<ZipResult> {
  const filename = name.toLowerCase().endsWith('.zip') ? name : `${name}.zip`
  const picker = opts.noPicker ? null : savePicker()

  // 1. Where the bytes go — asked first, while the click still counts.
  let writable: (WritableStream<Uint8Array> & { abort?: () => Promise<void> }) | null = null
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: 'Zip archive', accept: { 'application/zip': ['.zip'] } }],
      })
      writable = await handle.createWritable()
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return { failed: [], cancelled: true, streamedToDisk: false }
      }
      writable = null // the dialog is unavailable here (an iframe, a policy) — fall back to a Blob
    }
  }

  // 2. Presigned URLs for everything, 50 at a time, in parallel.
  const keys = items.filter((i) => i.key).map((i) => i.key!) as string[]
  const urls = keys.length ? await resolveUrls(Array.from(new Set(keys))) : {}

  const { makeZip } = await import('client-zip')
  const concurrency = Math.max(1, opts.concurrency ?? 6)
  const failed: string[] = []
  const total = items.length
  const bytesTotal = items.reduce((n, i) => n + (i.bytes ?? 0), 0)
  let done = 0
  let bytesDone = 0
  const report = () => opts.onProgress?.({ done, total, bytesDone, bytesTotal })
  const lastModified = new Date()

  type Entry = { name: string; input: AsyncIterable<Uint8Array> | string; lastModified: Date; size?: number }

  // The body is handed over as an async iterator rather than a piped stream: it
  // counts bytes for the progress bar as the zip consumes them, and it never trips
  // over a ReadableStream from another realm (a worker, a polyfill, a test runner).
  async function* counted(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
    const reader = body.getReader()
    try {
      for (;;) {
        const { done: end, value } = await reader.read()
        if (end) break
        bytesDone += value.byteLength
        report()
        yield value
      }
    } finally {
      reader.releaseLock()
    }
    done += 1
    report()
  }

  const fetchOne = async (item: ZipItem): Promise<Entry | null> => {
    if (item.text !== undefined) {
      return { name: item.path, input: item.text, lastModified }
    }
    const url = item.key ? urls[item.key] : undefined
    if (!url) {
      failed.push(item.path)
      return null
    }
    try {
      const res = await fetch(url, { signal: opts.signal })
      if (!res.ok || !res.body) throw new Error(String(res.status))
      const size = Number(res.headers.get('content-length')) || undefined
      return { name: item.path, input: counted(res.body), lastModified, size }
    } catch {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      failed.push(item.path)
      return null
    }
  }

  async function* entries(): AsyncGenerator<Entry> {
    // A window of fetches in flight, yielded in order: the zip is written in the
    // order the caller asked for, and the next files are already on their way.
    const queue: Promise<Entry | null>[] = []
    let i = 0
    const textItems = items.filter((it) => it.text !== undefined)
    const fileItems = items.filter((it) => it.text === undefined)
    while (i < fileItems.length && queue.length < concurrency) queue.push(fetchOne(fileItems[i++]))
    while (queue.length) {
      const next = await queue.shift()!
      if (i < fileItems.length) queue.push(fetchOne(fileItems[i++]))
      if (next) yield next
      else {
        done += 1
        report()
      }
    }
    for (const t of textItems) {
      yield { name: t.path, input: t.text!, lastModified }
      done += 1
    }
    if (opts.readme) {
      yield { name: opts.readmePath ?? 'README.md', input: opts.readme([...failed]), lastModified }
    }
    report()
  }

  report()
  const stream = makeZip(entries(), { buffersAreUTF8: true })
  try {
    if (writable) {
      await stream.pipeTo(writable, { signal: opts.signal })
      return { failed, cancelled: false, streamedToDisk: true }
    }
    const blob = await new Response(stream).blob()
    if (opts.signal?.aborted) return { failed, cancelled: true, streamedToDisk: false }
    ;(opts.sink ?? saveBlob)(blob, filename)
    return { failed, cancelled: false, streamedToDisk: false }
  } catch (err) {
    if (opts.signal?.aborted || (err as { name?: string })?.name === 'AbortError') {
      try { await writable?.abort?.() } catch { /* already closed */ }
      return { failed, cancelled: true, streamedToDisk: !!writable }
    }
    try { await writable?.abort?.() } catch { /* already closed */ }
    throw err
  }
}

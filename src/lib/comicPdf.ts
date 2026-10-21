'use client'

/**
 * comicPdf.ts — the comic as a PDF, assembled in the browser from the published page
 * images. One builder for every caller: the reader's three PDF buttons and the
 * "Download all" zip make the same file from the same keys.
 */

import { PDFDocument } from 'pdf-lib'
import type { Comic } from '@/types/content'
import { comicPdfKeys, webVariantKey } from '@/lib/comicPageKeys'
import { resolveUrls } from '@/lib/dataApi'
import { fetchPagesWithFallback } from '@/lib/exportFetch'
import { previewPageJpeg } from '@/lib/watermark'

/** What a download contains. `low` and `watermarked` are both low-resolution;
 *  only the latter carries the © Diamond Toons mark. */
export type PdfVariant = 'full' | 'low' | 'watermarked'

/** True when the bytes start with the PNG 8-byte signature. */
export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  )
}

/** True when the bytes start with the JPEG SOI marker. */
function isJpg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

/** Assemble a PDF (one page per image, page sized to the image). Pure — no DOM.
 * The format is sniffed from the actual bytes, not the HTTP content-type or the
 * key's extension — a page served as `.jpg` may really be PNG (and vice versa),
 * and pdf-lib throws if embedJpg/embedPng is handed the wrong format. We fall
 * back to the content-type only when neither signature is recognised. */
export async function buildComicPdf(
  images: { bytes: Uint8Array; type: string }[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const embeddedAll = []
  for (const img of images) {
    const usePng = isPng(img.bytes) || (!isJpg(img.bytes) && img.type.includes('png'))
    embeddedAll.push(usePng
      ? await pdf.embedPng(img.bytes)
      : await pdf.embedJpg(img.bytes))
  }
  const sizes = pdfPageSizes(embeddedAll.map((e) => ({ width: e.width, height: e.height })))
  embeddedAll.forEach((embedded, i) => {
    const [w, h] = sizes[i]
    const page = pdf.addPage([w, h])
    page.drawImage(embedded, { x: 0, y: 0, width: w, height: h })
  })
  return pdf.save()
}

/** One page size per plate, normalised to the book's own interior trim.
 *
 * The reference is the most common pixel size, which is the interior page. A
 * plate within 1% of its shape (an inside cover rendered at 2016x2822 beside
 * 1429x2000 pages) gets the reference size exactly; any other plate keeps its
 * own shape at the reference height. Sizing each page off its own pixels made
 * a same-shaped plate at a different resolution a different page size, which a
 * client reads as a defect (Diamond, 30 Sep 2026: "one approved size
 * throughout"). Pure. */
export function pdfPageSizes(dims: { width: number; height: number }[]): [number, number][] {
  if (dims.length === 0) return []
  const counts = new Map<string, number>()
  for (const d of dims) counts.set(`${d.width}x${d.height}`, (counts.get(`${d.width}x${d.height}`) ?? 0) + 1)
  let ref = dims[0]
  let best = 0
  for (const d of dims) {
    const n = counts.get(`${d.width}x${d.height}`) ?? 0
    if (n > best) { best = n; ref = d }
  }
  const refRatio = ref.height / ref.width
  return dims.map((d) => {
    const ratio = d.height / d.width
    if (Math.abs(ratio - refRatio) / refRatio <= 0.01) return [ref.width, ref.height]
    return [(d.width * ref.height) / d.height, ref.height]
  })
}

/**
 * The comic as PDF bytes, in BOOK order (`comicPdfKeys`: front cover, inside front cover,
 * pages, inside back cover).
 *
 * `full` embeds the print masters untouched. `low` and `watermarked` both start from the
 * 1200px web variants and downscale again; only `watermarked` is stamped, which is what
 * makes it safe to circulate. Throws, naming the stage, when pages cannot be fetched: a
 * PDF missing a page must never be handed over as the book.
 */
export async function comicPdfBytes(
  comic: Comic,
  variant: PdfVariant,
  opts: { signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  const small = variant !== 'full'
  // Resolve the masters always, plus the web variants when we want the small
  // ones, then fall back at FETCH time — `/resolve` signs a URL whether or not
  // the object exists, so a missing web variant only shows up on fetch. Inside
  // covers have no web variant; the fetch falls back to the master for them.
  const masterKeys = comicPdfKeys(comic)
  const pairs = masterKeys.map((masterKey) => ({ webKey: webVariantKey(masterKey), masterKey }))
  const urls = await resolveUrls(small ? [...pairs.map((p) => p.webKey), ...masterKeys] : masterKeys)
  const fetched = await fetchPagesWithFallback(pairs, urls, small)
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  type PageBytes = { bytes: Uint8Array; type: string }
  let images: PageBytes[] = fetched
    .filter((b): b is Uint8Array => b !== null)
    // Inside covers are PNG; pages are JPEG. Name the real format.
    .map((bytes) => ({ bytes, type: isPng(bytes) ? 'image/png' : 'image/jpeg' }))
  if (images.length === 0) throw new Error('no pages could be fetched')
  if (images.length < masterKeys.length) {
    throw new Error(`${masterKeys.length - images.length} of ${masterKeys.length} pages could not be fetched`)
  }
  if (small) {
    // Sequential, not Promise.all: a 64-page book would otherwise hold 64
    // decoded bitmaps and 64 canvases in memory at once.
    const processed: PageBytes[] = []
    for (const img of images) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      processed.push({
        bytes: await previewPageJpeg(img.bytes, img.type, { watermark: variant === 'watermarked' }),
        type: 'image/jpeg',
      })
    }
    images = processed
  }
  return buildComicPdf(images)
}

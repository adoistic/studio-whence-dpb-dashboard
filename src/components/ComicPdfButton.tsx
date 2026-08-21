'use client'

import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import type { Comic } from '@/types/content'
import { comicPageKeys, comicWebPageKeys } from '@/lib/comicPageKeys'
import { resolveUrls } from '@/lib/dataApi'
import { watermarkedPageJpeg } from '@/lib/watermark'

/** True when the bytes start with the PNG 8-byte signature. */
function isPng(bytes: Uint8Array): boolean {
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
  for (const img of images) {
    const usePng = isPng(img.bytes) || (!isJpg(img.bytes) && img.type.includes('png'))
    const embedded = usePng
      ? await pdf.embedPng(img.bytes)
      : await pdf.embedJpg(img.bytes)
    const page = pdf.addPage([embedded.width, embedded.height])
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
  }
  return pdf.save()
}

export function ComicPdfButton({ comic }: { comic: Comic }) {
  const [busy, setBusy] = useState<null | 'full' | 'preview'>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * @param preview  Build the share-safe copy: the 1200px web variants rather
   *   than the print masters, downscaled again and stamped `© Diamond Toons`.
   *   Diamond can circulate that without handing out print-quality art.
   */
  async function onDownload(preview: boolean) {
    setBusy(preview ? 'preview' : 'full'); setError(null)
    try {
      const keys = preview ? comicWebPageKeys(comic) : comicPageKeys(comic)
      const urls = await resolveUrls(keys)
      const ordered = keys.map((k) => urls[k]).filter(Boolean)
      if (ordered.length === 0) throw new Error('no pages')
      type PageBytes = { bytes: Uint8Array; type: string }
      let images: PageBytes[] = await Promise.all(
        ordered.map(async (u) => {
          const res = await fetch(u)
          if (!res.ok) throw new Error(`fetch ${res.status}`)
          const buf = new Uint8Array(await res.arrayBuffer())
          return { bytes: buf, type: res.headers.get('content-type') ?? 'image/jpeg' }
        }),
      )
      if (preview) {
        // Sequential, not Promise.all: a 64-page book would otherwise hold 64
        // decoded bitmaps and 64 canvases in memory at once.
        const stamped: PageBytes[] = []
        for (const img of images) {
          stamped.push({
            bytes: await watermarkedPageJpeg(img.bytes, img.type),
            type: 'image/jpeg',
          })
        }
        images = stamped
      }
      const pdfBytes = await buildComicPdf(images)
      // Copy into a fresh ArrayBuffer so the BlobPart type is a plain
      // ArrayBuffer (pdf-lib returns Uint8Array<ArrayBufferLike>).
      const buffer = new ArrayBuffer(pdfBytes.byteLength)
      new Uint8Array(buffer).set(pdfBytes)
      const blob = new Blob([buffer], { type: 'application/pdf' })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = preview ? `${comic.slug}-preview-watermarked.pdf` : `${comic.slug}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      console.error('[ComicPdfButton]', err)
      setError('Could not build the PDF. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onDownload(false)}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-full bg-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === 'full' ? 'Building PDF…' : 'Download PDF'}
        </button>
        <button
          type="button"
          onClick={() => onDownload(true)}
          disabled={busy !== null}
          title="Low-resolution, stamped © Diamond Toons — safe to circulate"
          className="inline-flex items-center gap-2 rounded-full border border-brand-pale-dusk px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60 disabled:opacity-50"
        >
          {busy === 'preview' ? 'Building preview…' : 'Preview PDF (watermarked)'}
        </button>
      </div>
      {error && <span role="alert" className="font-sans text-[0.7rem] text-red-700">{error}</span>}
    </div>
  )
}

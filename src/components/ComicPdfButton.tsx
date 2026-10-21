'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { comicPdfBytes, type PdfVariant } from '@/lib/comicPdf'

// The assembly lives in lib/comicPdf so the "Download all" zip builds the same file.
export { buildComicPdf, pdfPageSizes } from '@/lib/comicPdf'

export function ComicPdfButton({ comic }: { comic: Comic }) {
  const [busy, setBusy] = useState<null | PdfVariant>(null)
  const [error, setError] = useState<string | null>(null)

  /** `full` embeds the print masters; `low` and `watermarked` are light copies (lib/comicPdf). */
  async function onDownload(variant: PdfVariant) {
    setBusy(variant); setError(null)
    try {
      const pdfBytes = await comicPdfBytes(comic, variant)
      // Copy into a fresh ArrayBuffer so the BlobPart type is a plain
      // ArrayBuffer (pdf-lib returns Uint8Array<ArrayBufferLike>).
      const buffer = new ArrayBuffer(pdfBytes.byteLength)
      new Uint8Array(buffer).set(pdfBytes)
      const blob = new Blob([buffer], { type: 'application/pdf' })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = {
        full: `${comic.slug}.pdf`,
        low: `${comic.slug}-lowres.pdf`,
        watermarked: `${comic.slug}-lowres-watermarked.pdf`,
      }[variant]
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      // Name the STAGE. The first report of this feature failing was a bare
      // "Could not build the PDF", which located nothing: the cause turned out
      // to be pages resolving to zero URLs, several layers from the message.
      console.error('[ComicPdfButton]', variant, err)
      const detail = err instanceof Error ? err.message : String(err)
      setError(`Could not build the ${variant === 'full' ? 'PDF' : 'preview'} — ${detail}. Please try again.`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onDownload('full')}
          disabled={busy !== null}
          title="Full-resolution print masters"
          className="inline-flex items-center gap-2 rounded-full bg-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === 'full' ? 'Building PDF…' : 'Download PDF'}
        </button>
        <button
          type="button"
          onClick={() => onDownload('low')}
          disabled={busy !== null}
          title="Low-resolution, no watermark — a light file to read or email"
          className="inline-flex items-center gap-2 rounded-full border border-brand-pale-dusk px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60 disabled:opacity-50"
        >
          {busy === 'low' ? 'Building…' : 'Low-res PDF'}
        </button>
        <button
          type="button"
          onClick={() => onDownload('watermarked')}
          disabled={busy !== null}
          title="Low-resolution and stamped © Diamond Toons — safe to circulate"
          className="inline-flex items-center gap-2 rounded-full border border-brand-pale-dusk px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60 disabled:opacity-50"
        >
          {busy === 'watermarked' ? 'Building…' : 'Low-res + watermark'}
        </button>
      </div>
      {error && <span role="alert" className="font-sans text-[0.7rem] text-red-700">{error}</span>}
    </div>
  )
}

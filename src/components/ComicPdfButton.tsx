'use client'

import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import type { Comic } from '@/types/content'
import { comicPageKeys } from '@/lib/comicPageKeys'
import { resolveUrls } from '@/lib/dataApi'

/** Assemble a PDF (one page per image, page sized to the image). Pure — no DOM. */
export async function buildComicPdf(
  images: { bytes: Uint8Array; type: string }[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (const img of images) {
    const embedded = img.type.includes('png')
      ? await pdf.embedPng(img.bytes)
      : await pdf.embedJpg(img.bytes)
    const page = pdf.addPage([embedded.width, embedded.height])
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
  }
  return pdf.save()
}

export function ComicPdfButton({ comic }: { comic: Comic }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onDownload() {
    setBusy(true); setError(null)
    try {
      const keys = comicPageKeys(comic)
      const urls = await resolveUrls(keys)
      const ordered = keys.map((k) => urls[k]).filter(Boolean)
      if (ordered.length === 0) throw new Error('no pages')
      const images = await Promise.all(
        ordered.map(async (u) => {
          const res = await fetch(u)
          if (!res.ok) throw new Error(`fetch ${res.status}`)
          const buf = new Uint8Array(await res.arrayBuffer())
          return { bytes: buf, type: res.headers.get('content-type') ?? 'image/jpeg' }
        }),
      )
      const pdfBytes = await buildComicPdf(images)
      // Copy into a fresh ArrayBuffer so the BlobPart type is a plain
      // ArrayBuffer (pdf-lib returns Uint8Array<ArrayBufferLike>).
      const buffer = new ArrayBuffer(pdfBytes.byteLength)
      new Uint8Array(buffer).set(pdfBytes)
      const blob = new Blob([buffer], { type: 'application/pdf' })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href; a.download = `${comic.slug}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(href)
    } catch {
      setError('Could not build the PDF. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full bg-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Building PDF…' : 'Download PDF'}
      </button>
      {error && <span role="alert" className="font-sans text-[0.7rem] text-red-700">{error}</span>}
    </div>
  )
}

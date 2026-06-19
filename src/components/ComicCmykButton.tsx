'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { resolveUrls } from '@/lib/dataApi'

/**
 * "Download CMYK (print)" — resolves the comic's gated `cmykPdf.key` to a
 * short-lived presigned R2 URL (the same `/resolve` channel the page-image PDF
 * and editable-PPT buttons use), fetches the print-ready CMYK PDF bytes, and
 * triggers a browser download. Renders nothing when the comic has no CMYK PDF.
 *
 * Mirrors ComicPptButton's resolve→fetch→Blob→anchor-click flow exactly; the
 * artifact is a single PDF separated to PSO Uncoated v3 (FOGRA52).
 */
export function ComicCmykButton({ comic }: { comic: Comic }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cmyk = comic.cmykPdf
  if (!cmyk?.key) return null

  async function onDownload() {
    if (!cmyk?.key) return
    setBusy(true); setError(null)
    try {
      const urls = await resolveUrls([cmyk.key])
      const url = urls[cmyk.key]
      if (!url) throw new Error('no presigned url')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = cmyk.filename || `${comic.slug}-CMYK.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      console.error('[ComicCmykButton]', err)
      setError('Could not download the CMYK PDF. Please try again.')
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
        className="inline-flex items-center gap-2 rounded-full border border-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {busy ? 'Downloading…' : 'Download CMYK (print)'}
      </button>
      {error && <span role="alert" className="font-sans text-[0.7rem] text-red-700">{error}</span>}
    </div>
  )
}

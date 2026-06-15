'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { resolveUrls } from '@/lib/dataApi'

/**
 * "Download as PPT (editable)" — resolves the comic's gated `editablePpt.key`
 * to a short-lived presigned R2 URL (via the same `/resolve` channel the PDF
 * button uses for page images), fetches the .pptx bytes, and triggers a
 * browser download. Renders nothing when the comic has no editable PPT.
 *
 * Mirrors ComicPdfButton's resolve→fetch→Blob→anchor-click flow; the only
 * difference is a single artifact key instead of an image set, and no PDF
 * assembly (the .pptx is downloaded as-is).
 */
export function ComicPptButton({ comic }: { comic: Comic }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ppt = comic.editablePpt
  if (!ppt?.key) return null

  async function onDownload() {
    if (!ppt?.key) return
    setBusy(true); setError(null)
    try {
      const urls = await resolveUrls([ppt.key])
      const url = urls[ppt.key]
      if (!url) throw new Error('no presigned url')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = ppt.filename || `${comic.slug}.pptx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      console.error('[ComicPptButton]', err)
      setError('Could not download the PPT. Please try again.')
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
        {busy ? 'Downloading…' : 'Download as PPT (editable)'}
      </button>
      {error && <span role="alert" className="font-sans text-[0.7rem] text-red-700">{error}</span>}
    </div>
  )
}

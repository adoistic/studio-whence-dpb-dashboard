'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { resolveUrls } from '@/lib/dataApi'

/**
 * "Panels: Word / PDF" — downloads the PANEL-LAYOUT script export.
 *
 * Why this exists: the `Script | Panels` toggle was screen-only. It renders the
 * approximate comic-page layout live in the browser, but a reviewer who wanted
 * to PRINT it — or mark it up on paper, or mail it to an editor — had nothing to
 * download, because only `panels/{line}/{slug}.json` was ever published
 * (Adnan, 2026-08-29). `render_comic.sh --layout panel` had produced the same
 * layout as .docx and .pdf all along; the files simply never left the machine.
 *
 * The bytes come through the same gated `/resolve` channel as the CMYK PDF and
 * the editable deck — comic-scoped `artifacts/comics/…` keys, presigned for a
 * short window — so no new gate wiring was needed to ship this.
 *
 * Renders nothing when the comic has no published panel export, which is the
 * correct state for activity books and storybooks (no panel grammar).
 */
export function ComicPanelExportButton({ comic }: { comic: Comic }) {
  const [busy, setBusy] = useState<null | 'docx' | 'pdf'>(null)
  const [error, setError] = useState<string | null>(null)

  const exp = comic.scriptExports
  if (!exp?.docxKey || !exp?.pdfKey) return null

  async function download(kind: 'docx' | 'pdf') {
    if (!exp) return
    const key = kind === 'docx' ? exp.docxKey : exp.pdfKey
    setBusy(kind); setError(null)
    try {
      const urls = await resolveUrls([key])
      const url = urls[key]
      if (!url) throw new Error('no presigned url')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `${comic.slug}-panels.${kind}`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      console.error('[ComicPanelExportButton]', err)
      setError(`Could not download the panel ${kind.toUpperCase()}. Please try again.`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className="inline-flex items-center gap-0.5 rounded-full border border-brand-indigo p-0.5"
        role="group"
        aria-label="Download the panel layout"
      >
        <span className="px-3 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate">
          Panels
        </span>
        {(['docx', 'pdf'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => download(kind)}
            disabled={busy !== null}
            title={`Download the panel layout as ${kind === 'docx' ? 'an editable Word file' : 'a print-ready PDF'}`}
            className="rounded-full px-4 py-1.5 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {busy === kind ? '…' : kind === 'docx' ? 'Word' : 'PDF'}
          </button>
        ))}
      </div>
      {error && <span role="alert" className="font-sans text-[0.7rem] text-red-700">{error}</span>}
    </div>
  )
}

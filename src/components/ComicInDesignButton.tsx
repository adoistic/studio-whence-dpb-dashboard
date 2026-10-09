'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { downloadKey } from '@/lib/downloadDoc'

/**
 * "Download InDesign (editable)" — the comic's InDesign design files (.indd + .idml + the
 * Links/ page art, zipped), resolved from its gated `indesign.key` through the same `/resolve`
 * channel as the PPT. Sits beside ComicPptButton; renders nothing when the comic has none.
 */
export function ComicInDesignButton({ comic }: { comic: Comic }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const indd = comic.indesign
  if (!indd?.key) return null

  async function onDownload() {
    if (!indd?.key) return
    setBusy(true); setError(null)
    try {
      await downloadKey(indd.key, indd.filename || `${comic.slug}-InDesign.zip`)
    } catch (err) {
      console.error('[ComicInDesignButton]', err)
      setError('Could not download the InDesign files. Please try again.')
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
        {busy ? 'Downloading…' : 'Download InDesign (editable)'}
      </button>
      {error && <span role="alert" className="font-sans text-[0.7rem] text-red-700">{error}</span>}
    </div>
  )
}

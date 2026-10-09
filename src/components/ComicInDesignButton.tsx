'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { downloadKey } from '@/lib/downloadDoc'

const LANG_NAME: Record<string, string> = { en: 'English', hi: 'Hindi', 'hi-latn': 'Hinglish' }

/** The language name of the comic's own edition ("English" unless the book was authored in another). */
export function ownLanguageName(comic: Comic): string {
  const code = (comic.originalLanguage || 'en').toLowerCase()
  return LANG_NAME[code] || comic.originalLanguage || 'English'
}

/**
 * The comic's InDesign design files, resolved from gated keys through the same `/resolve` channel
 * as the PPT. Two kinds, labelled so a designer knows which is which:
 *   - "Download InDesign — <language> only": that language's .indd + .idml + Links/ (`indesign`)
 *   - "Download InDesign — all languages, one file": one document with the shared artwork and a
 *     text layer per language (`indesignAll`)
 * Each renders nothing when the comic has none.
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
        {busy ? 'Downloading…' : `Download InDesign — ${ownLanguageName(comic)} only`}
      </button>
      {error && <span role="alert" className="font-sans text-[0.7rem] text-red-700">{error}</span>}
    </div>
  )
}

export function ComicInDesignAllButton({ comic }: { comic: Comic }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const all = comic.indesignAll
  if (!all?.key) return null

  async function onDownload() {
    if (!all?.key) return
    setBusy(true); setError(null)
    try {
      await downloadKey(all.key, all.filename || `${comic.slug}-InDesign-ALL-LANGUAGES.zip`)
    } catch (err) {
      console.error('[ComicInDesignAllButton]', err)
      setError('Could not download the InDesign file. Please try again.')
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
        {busy ? 'Downloading…' : 'Download InDesign — all languages, one file'}
      </button>
      <span className="max-w-[18rem] font-sans text-[0.68rem] leading-snug text-brand-slate">
        One document: shared artwork, plus a layer per language ({(all.languages || []).join(', ')}).
      </span>
      {error && <span role="alert" className="font-sans text-[0.7rem] text-red-700">{error}</span>}
    </div>
  )
}

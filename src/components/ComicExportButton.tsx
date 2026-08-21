'use client'

// "Export…" button + dialog for the three portal export formats. All
// generation is client-side over live gated data; heavy modules
// (exportZip → jszip, exportDocx → docx) load only inside the handler.
import { useState } from 'react'
import type { Comic } from '@/types/content'
import { appliesToLanguage } from '@/lib/feedbackTypes'
import type { Thread } from '@/lib/feedbackTypes'
import { buildExportModel, type ExportOptions } from '@/lib/exportModel'
import { fetchExportImages } from '@/lib/exportFetch'
import { previewImageMap } from '@/lib/watermark'

type Format = 'zip' | 'author' | 'side'

function download(bytes: Uint8Array, filename: string, mime: string) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const href = URL.createObjectURL(new Blob([buffer], { type: mime }))
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}

/**
 * The threads an export should carry: exactly what the reader is seeing in this
 * language. Exporting every language's comments into one document would put
 * Hindi feedback into an English handoff — the same conflation the reader was
 * changed to avoid.
 */
export function exportableThreads(
  threads: Thread[], lang: string, originalLanguage: string,
): Thread[] {
  return threads.filter((t) => appliesToLanguage(t.root, lang, originalLanguage))
}

export function ComicExportButton({ comic, threads, draftHtml, lang, originalLanguage }: {
  comic: Comic
  /** ALREADY visibility-filtered by the caller (visibleTo per role). */
  threads: Thread[]
  /** The language being read; the export is scoped to it. Optional so a call
   *  site without language context behaves exactly as before. */
  lang?: string
  /** The comic's authored language — how a pre-language comment is attributed. */
  originalLanguage?: string
  /** Rendered draft HTML, or null for script-less (legacy) comics. */
  draftHtml: string | null
}) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<Format>('zip')
  const [includeComments, setIncludeComments] = useState(true)
  const [includeScript, setIncludeScript] = useState(true)
  const [includeResolved, setIncludeResolved] = useState(false)
  // Page images: full masters, a light low-resolution copy, or a low-resolution
  // copy stamped © Diamond Toons. Full by default — the export is a working
  // bundle for reviewers, and only becomes a share-safe copy on request.
  const [pageQuality, setPageQuality] = useState<'full' | 'low' | 'watermarked'>('full')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  if (!comic.pages?.hasPages) return null
  const hasScript = !!draftHtml
  const nothingIncluded = !includeComments && !(hasScript && includeScript)

  async function onGenerate() {
    setBusy(true)
    setNote(null)
    try {
      const options: ExportOptions = {
        includeComments,
        includeScript: hasScript && includeScript,
        includeResolved,
      }
      const { parseDraftHtml } = await import('@/lib/comicDocx')
      const draftPages = draftHtml ? parseDraftHtml(draftHtml).pages : null
      const model = buildExportModel({
        comic,
        threads: exportableThreads(threads, lang ?? originalLanguage ?? 'en',
                                   originalLanguage ?? 'en'),
        draftPages,
        options,
      })
      const { images: fetched, failed } = await fetchExportImages(comic)
      const images = pageQuality === 'full'
        ? fetched
        : await previewImageMap(fetched, { watermark: pageQuality === 'watermarked' })

      if (format === 'zip') {
        const { buildExportZip } = await import('@/lib/exportZip')
        const zipSuffix = { full: '', low: '-lowres', watermarked: '-lowres-watermarked' }[pageQuality]
        download(
          await buildExportZip(model, images),
          `${comic.slug}-export${zipSuffix}.zip`,
          'application/zip',
        )
      } else {
        const blocksMod = await import('@/lib/exportBlocks')
        const blocks = format === 'author'
          ? blocksMod.authorDocBlocks(model)
          : blocksMod.sideBySideDocBlocks(model)
        const { assembleDocx } = await import('@/lib/exportDocx')
        const bytes = await assembleDocx(blocks, images, format === 'author' ? 'portrait' : 'landscape')
        const name = format === 'author' ? `${comic.slug}-author.docx` : `${comic.slug}-sidebyside.docx`
        download(bytes, name, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      }
      if (failed.length > 0) {
        setNote(`Done — but ${failed.length} image(s) could not be fetched (${failed.join(', ')}); they appear as placeholders.`)
      } else {
        setNote(null)
        setOpen(false)
      }
    } catch (err) {
      console.error('[ComicExportButton]', err)
      setNote('Export failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const radio = (value: Format, label: string) => (
    <label key={value} className="flex items-center gap-2 font-sans text-[0.8rem] text-brand-ink">
      <input type="radio" name="export-format" checked={format === value} onChange={() => setFormat(value)} aria-label={label} />
      {label}
    </label>
  )
  const pageRadio = (value: 'full' | 'low' | 'watermarked', label: string) => (
    <label key={value} className="flex items-center gap-2 font-sans text-[0.8rem] text-brand-ink">
      <input
        type="radio"
        name="export-page-quality"
        checked={pageQuality === value}
        onChange={() => setPageQuality(value)}
        aria-label={label}
      />
      {label}
    </label>
  )
  const check = (checked: boolean, set: (v: boolean) => void, label: string) => (
    <label className="flex items-center gap-2 font-sans text-[0.8rem] text-brand-ink">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} aria-label={label} />
      {label}
    </label>
  )

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full bg-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-opacity hover:opacity-90"
      >
        Export…
      </button>
      {open && (
        <div role="dialog" aria-label="Export comic" className="mt-2 flex w-72 flex-col gap-3 rounded-xl border border-black/10 bg-white p-4 shadow-lg">
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[0.68rem] font-semibold uppercase tracking-label text-brand-ink/60">Format</span>
            {radio('zip', 'LLM-ready ZIP')}
            {radio('author', 'Author Word')}
            {radio('side', 'Side-by-side Word')}
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[0.68rem] font-semibold uppercase tracking-label text-brand-ink/60">Include</span>
            {check(includeComments, setIncludeComments, 'Comments')}
            {hasScript && check(includeScript, setIncludeScript, 'Script')}
            {check(includeResolved, setIncludeResolved, "Include resolved / won't-fix threads")}
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[0.68rem] font-semibold uppercase tracking-label text-brand-ink/60">Page images</span>
            {pageRadio('full', 'Full resolution')}
            {pageRadio('low', 'Low resolution')}
            {pageRadio('watermarked', 'Low resolution + watermark')}
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy || nothingIncluded}
            className="inline-flex items-center justify-center rounded-full bg-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
          {note && <span role="alert" className="font-sans text-[0.7rem] text-red-700">{note}</span>}
        </div>
      )}
    </div>
  )
}

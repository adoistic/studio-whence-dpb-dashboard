'use client'

import { useEffect, useState } from 'react'
import type { Comic, GatedFile } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'
import { useResolved, refreshResolved } from '@/lib/useResolved'
import { downloadKey, formatBytes } from '@/lib/downloads'

/**
 * The PRINT VERSION of a black-and-white book: the file for the press, shown page by page beside the
 * file as first sent, either as the files themselves or as they are expected to print (the print
 * simulator: the measured digital test print, and the estimate for the press the book will run on).
 * Then the downloads and the test sheet. Renders nothing unless the catalog published a `printVersion`.
 */
export function PrintVersion({ comic, urlFor }: { comic: Comic; urlFor?: (key: string) => string }) {
  const pv = comic.printVersion
  const cmp = pv?.compare
  const views = cmp?.views ?? []
  const [page, setPage] = useState(cmp?.quickPages?.[0]?.page ?? 1)
  const [view, setView] = useState(views[views.length - 1]?.id ?? '')
  const [zoom, setZoom] = useState<string | null>(null)

  const sides = (cmp?.versions ?? []).slice(0, 2)
  const keyFor = (version: string) =>
    cmp ? `${cmp.viewPrefix}/${version}/${view}/page-${String(page).padStart(3, '0')}.jpg` : ''
  // `urlFor` is for the dev harness only (no session to sign keys with); the portal always resolves.
  const resolved = useResolved(urlFor ? [] : sides.map((s) => keyFor(s.id)))
  const urls: Record<string, string> = urlFor
    ? Object.fromEntries(sides.map((s) => [keyFor(s.id), urlFor(keyFor(s.id))]))
    : resolved

  useEffect(() => {
    if (!zoom) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  if (!pv || !cmp || sides.length < 2) return null
  const viewNote = views.find((v) => v.id === view)?.note
  const viewLabel = views.find((v) => v.id === view)?.label ?? ''
  const why = cmp.quickPages?.find((q) => q.page === page)?.why

  return (
    <section className="flex flex-col gap-8 border-t border-brand-pale-dusk pt-16">
      <SectionHead kicker="For the printer" title={pv.label} />
      <div className="flex max-w-[70ch] flex-col gap-3 font-sans text-[0.95rem] leading-relaxed text-brand-slate">
        {pv.intro && <p>{pv.intro}</p>}
        <p>{pv.summary}</p>
      </div>

      {/* Downloads first: the reason most people come to this section. */}
      <div className="flex flex-wrap items-start gap-3">
        {pv.files.pdf && <DownloadButton file={pv.files.pdf} label="Download print PDF" primary />}
        {pv.files.tiff && <DownloadButton file={pv.files.tiff} label="Pages as TIFF" />}
        {pv.testPack && <DownloadButton file={pv.testPack} label="Test sheet (PDF)" />}
      </div>
      {pv.testPack && (
        <p className="-mt-4 max-w-[70ch] font-sans text-[0.8rem] text-brand-slate">
          The test sheet holds {pv.testPack.pages?.length ?? 'a few'} of the hardest pages, as sent and as the
          print version, each with a strip of grey steps from 0 to 100%. Printed on the real press and paper before
          the run, it shows how much the ink spreads.
        </p>
      )}

      {/* Compare */}
      <div className="flex flex-col gap-5 rounded-lg border border-brand-pale-dusk bg-white/60 p-5">
        <div className="flex flex-col gap-2">
          <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-lavender">Compare a page</span>
          <div className="flex flex-wrap items-center gap-2">
            {(cmp.quickPages ?? []).map((q) => (
              <button
                key={q.page}
                type="button"
                onClick={() => setPage(q.page)}
                aria-pressed={page === q.page}
                title={q.why}
                className={`rounded-full border px-3 py-1 font-sans text-[0.75rem] transition-colors ${
                  page === q.page
                    ? 'border-brand-indigo bg-brand-indigo text-brand-pale-dusk'
                    : 'border-brand-pale-dusk text-brand-indigo hover:bg-brand-threshold'
                }`}
              >
                p. {q.page}
              </button>
            ))}
            <label className="ml-1 flex items-center gap-2 font-sans text-[0.75rem] text-brand-slate">
              or page
              <input
                id="print-version-page"
                type="number"
                min={1}
                max={pv.pages}
                value={page}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value))
                  if (n >= 1 && n <= pv.pages) setPage(n)
                }}
                className="w-20 rounded border border-brand-pale-dusk bg-white px-2 py-1 text-brand-indigo"
              />
              <span>of {pv.pages}</span>
            </label>
          </div>
          {why && <p className="font-sans text-[0.8rem] italic text-brand-slate">Page {page}: {why}.</p>}
        </div>

        <div className="flex flex-col gap-2">
          <div role="radiogroup" aria-label="See the pages as" className="flex flex-wrap gap-2">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={view === v.id}
                onClick={() => setView(v.id)}
                className={`rounded-full border px-4 py-1.5 font-sans text-[0.72rem] font-semibold uppercase tracking-label transition-colors ${
                  view === v.id
                    ? 'border-brand-indigo bg-brand-indigo text-brand-pale-dusk'
                    : 'border-brand-pale-dusk text-brand-indigo hover:bg-brand-threshold'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {viewNote && <p className="font-sans text-[0.8rem] text-brand-slate">{viewNote}</p>}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {sides.map((s) => {
            const k = keyFor(s.id)
            const url = urls[k]
            return (
              <figure key={s.id} className="flex min-w-0 flex-col gap-2">
                <figcaption className="font-sans text-[0.8rem] font-semibold text-brand-indigo">{s.label}</figcaption>
                <button
                  type="button"
                  onClick={() => url && setZoom(url)}
                  className="relative block aspect-[5/7] w-full overflow-hidden rounded border border-brand-pale-dusk bg-brand-threshold"
                  aria-label={`Enlarge page ${page}, ${s.label}`}
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={`Page ${page}, ${s.label}, ${viewLabel}`}
                      className="h-full w-full object-contain"
                      onError={() => refreshResolved(k)}
                    />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center font-sans text-[0.75rem] text-brand-slate">
                      Loading…
                    </span>
                  )}
                </button>
              </figure>
            )
          })}
        </div>
        <p className="font-sans text-[0.75rem] text-brand-slate">Tap a page to enlarge it.</p>
      </div>

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged page"
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-brand-deep/85 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Enlarged page" className="max-h-full max-w-full object-contain shadow-2xl" />
          <button
            type="button"
            onClick={() => setZoom(null)}
            className="absolute right-4 top-4 rounded-full bg-white/90 px-4 py-1.5 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo"
          >
            Close
          </button>
        </div>
      )}
    </section>
  )
}

function DownloadButton({ file, label, primary = false }: { file: GatedFile; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await downloadKey(file.key, file.filename)
          } catch (err) {
            console.error('[PrintVersion]', err)
            setError('Could not download. Please try again.')
          } finally {
            setBusy(false)
          }
        }}
        title={file.filename}
        className={`rounded-full px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label transition-opacity disabled:opacity-50 ${
          primary
            ? 'bg-brand-indigo text-brand-pale-dusk hover:opacity-90'
            : 'border border-brand-indigo text-brand-indigo hover:opacity-80'
        }`}
      >
        {busy ? 'Starting…' : label}
        <span className="ml-1.5 font-normal normal-case tracking-normal opacity-75">{formatBytes(file.bytes)}</span>
      </button>
      {error && (
        <span role="alert" className="font-sans text-[0.7rem] text-red-700">
          {error}
        </span>
      )}
    </span>
  )
}

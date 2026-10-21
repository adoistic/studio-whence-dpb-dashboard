'use client'

/**
 * ComicDownloadAll — "Download all" on a comic's page: every file the portal holds for
 * the book, as one zip in numbered folders with a README.txt that explains them.
 *
 * Adnan, 21 Oct 2026: "Someone might just want them all."
 *
 * The button opens a panel that lists what this book has, a row per kind with its size,
 * all ticked. Nobody should start a gigabyte without seeing it say a gigabyte, and anyone
 * who wants less can untick a row. The zip is built in the browser from the same gated
 * keys the page's single-file buttons use (`lib/downloadAll` plans it, `lib/downloadAllRun`
 * builds it), and goes straight to disk where the browser allows.
 */

import { useEffect, useMemo, useState } from 'react'
import type { Comic, CoverChoice, Figure, ResearchSource } from '@/types/content'
import type { CastDoc } from '@/lib/castModel'
import type { Thread } from '@/lib/feedbackTypes'
import { buildBundlePlan, type BundleGroupId } from '@/lib/downloadAll'
import { runDownloadAll } from '@/lib/downloadAllRun'
import { formatBytes, type ZipProgress } from '@/lib/downloads'

/** Over this, a browser that cannot stream to disk is warned before it starts. */
const MEMORY_WARN_BYTES = 1.5e9

/** How long the panel waits for the official-cover lookup before going on without it. */
export const COVER_CHOICE_WAIT_MS = 5000

function canStreamToDisk(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

function size(bytes: number, approx: boolean): string {
  return `${approx ? '≈ ' : ''}${formatBytes(bytes)}`
}

/** The official cover of each language the book has covers in, read once when the panel opens. */
function useCoverChoices(comic: Comic, enabled: boolean): Record<string, CoverChoice | null> | null {
  const [choices, setChoices] = useState<Record<string, CoverChoice | null> | null>(null)
  const comicId = `${comic.line}__${comic.slug}`
  const original = (comic.originalLanguage ?? 'en').toLowerCase()
  const langs = useMemo(() => {
    const codes = new Set((comic.coverOptions?.options ?? []).map((o) => (o.lang ?? original).toLowerCase()))
    codes.add(original)
    return Array.from(codes).sort()
  }, [comic.coverOptions, original])
  const langKey = langs.join(',')

  useEffect(() => {
    if (!enabled) return
    let active = true
    // Imported here, not at the top: Firestore is touched only once the panel is open.
    const lookup = import('@/lib/coverChoice')
      .then(({ coverChoiceDocId, fetchCoverChoice }) =>
        Promise.all(langs.map(async (code) => {
          try {
            return [code, await fetchCoverChoice(coverChoiceDocId(comicId, code, original))] as const
          } catch {
            return [code, null] as const
          }
        })))
      .catch(() => [] as (readonly [string, CoverChoice | null])[])
    // The official cover is a nicety: a lookup that has not answered in a few seconds
    // must not hold the download up. The zip then goes without the "Official cover" copy.
    const timeout = new Promise<(readonly [string, CoverChoice | null])[]>((resolve) =>
      setTimeout(() => resolve([]), COVER_CHOICE_WAIT_MS))
    Promise.race([lookup, timeout]).then((pairs) => {
      if (active) setChoices(Object.fromEntries(pairs))
    })
    return () => { active = false }
    // `langKey` stands for `langs`, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, comicId, original, langKey])

  return choices
}

export function ComicDownloadAll({
  comic,
  figure,
  figureLoading = false,
  cast,
  castLoading = false,
  threads,
  hasDraft,
}: {
  comic: Comic
  /** `useFigure(subject).data`: the research, when the viewer may read it. */
  figure: { figure: Figure; sources: ResearchSource[] } | null
  figureLoading?: boolean
  cast: CastDoc | null
  castLoading?: boolean
  /** The comment threads the viewer can see. */
  threads: Thread[]
  /** False when the original-language draft is known to be missing. */
  hasDraft?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [unticked, setUnticked] = useState<Set<BundleGroupId>>(() => new Set())
  const [busy, setBusy] = useState<{ progress: ZipProgress | null; abort: AbortController } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const choices = useCoverChoices(comic, open)

  const ctx = useMemo(
    () => ({ figure, cast, threads, coverChoices: choices ?? undefined, hasDraft }),
    [figure, cast, threads, choices, hasDraft],
  )
  const plan = useMemo(() => buildBundlePlan(comic, ctx), [comic, ctx])
  const chosen = plan.groups.filter((g) => !unticked.has(g.id))
  const total = chosen.reduce((n, g) => n + g.bytes, 0)
  const totalApprox = chosen.some((g) => g.approx)
  const files = chosen.reduce((n, g) => n + g.items.length, 0) + 1
  const loading = figureLoading || castLoading || (open && choices === null)
  const panelId = `download-all-${comic.line}-${comic.slug}`

  function toggle(id: BundleGroupId) {
    setUnticked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function start() {
    if (busy || chosen.length === 0) return
    const abort = new AbortController()
    setNotice(null)
    setBusy({ progress: null, abort })
    // Straight from the click: the save dialog needs the click's activation.
    runDownloadAll({
      comic,
      plan,
      ctx,
      selected: new Set(chosen.map((g) => g.id)),
      signal: abort.signal,
      onProgress: (progress) => setBusy((b) => (b ? { ...b, progress } : b)),
    })
      .then((r) => {
        if (r.cancelled) setNotice('Download cancelled.')
        else if (r.failed.length) setNotice(`Done, but ${plural(r.failed.length, 'file')} could not be fetched. README.txt in the zip lists ${r.failed.length === 1 ? 'it' : 'them'}.`)
        else setNotice(r.streamedToDisk ? 'Saved. Open README.txt in the zip first.' : 'Download ready: check your downloads. Open README.txt in the zip first.')
      })
      .catch((err) => {
        console.error('[ComicDownloadAll]', err)
        setNotice('The zip could not be built. Please try again.')
      })
      .finally(() => setBusy(null))
  }

  const p = busy?.progress
  const pct = p && p.bytesTotal > 0 ? Math.min(100, Math.round((p.bytesDone / p.bytesTotal) * 100)) : 0
  const now = p?.current ? p.current.slice(p.current.lastIndexOf('/') + 1) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full bg-brand-gold px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-deep transition-opacity hover:opacity-90"
        >
          <DownloadIcon />
          Download all
        </button>
        {!open && (
          <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/60">
            Every file for this book, in one zip
          </span>
        )}
      </div>

      {open && (
        <section
          id={panelId}
          aria-label="Download all files for this book"
          className="w-full max-w-3xl rounded-brand border border-white/10 bg-brand-cream p-5 text-brand-umber shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] md:p-6"
        >
          {/* Inline colour: the masthead's unlayered `.surface-deep h2` rule outranks a utility class. */}
          <h2 className="font-serif text-xl leading-tight" style={{ color: 'var(--brand-indigo)' }}>
            Everything for this book
          </h2>
          <p className="mt-2 font-serif leading-relaxed">
            One zip, sorted into numbered folders. A README.txt at the top says what every folder and file is,
            and what this book does not have yet. Untick anything you do not need.
          </p>

          {loading ? (
            <p role="status" className="mt-5 font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
              Checking what this book has…
            </p>
          ) : (
            <ul className="mt-5 flex flex-col divide-y divide-brand-pale-dusk border-y border-brand-pale-dusk">
              {plan.groups.map((g) => {
                const on = !unticked.has(g.id)
                return (
                  <li key={g.id}>
                    <label className="flex cursor-pointer items-start gap-3 py-3">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!!busy}
                        onChange={() => toggle(g.id)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-indigo)]"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                          <span className={`font-sans text-[0.8rem] font-semibold ${on ? 'text-brand-indigo' : 'text-brand-slate line-through'}`}>
                            {g.title}
                          </span>
                          <span className="font-sans text-[0.72rem] tabular-nums text-brand-slate">
                            {plural(g.items.length, 'file')} · {size(g.bytes, g.approx)}
                          </span>
                        </span>
                        <span className="font-sans text-[0.72rem] leading-snug text-brand-slate">
                          <span className="font-semibold">{g.folder}</span> — {g.blurb}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}

          {busy ? (
            <div className="mt-5 flex flex-col gap-2" aria-live="polite">
              <div
                role="progressbar"
                aria-label="Download progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="h-2 w-full overflow-hidden rounded-full bg-brand-pale-dusk"
              >
                <div className="h-full rounded-full bg-brand-indigo transition-[width]" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-sans text-[0.72rem] tabular-nums text-brand-slate">
                  {p
                    ? `${Math.min(p.done, p.total).toLocaleString('en-US')} of ${plural(p.total, 'file')} · ${formatBytes(p.bytesDone)} of ${size(p.bytesTotal, totalApprox)}`
                    : 'Starting…'}
                </span>
                <button
                  type="button"
                  onClick={() => busy.abort.abort()}
                  className="rounded-full border border-brand-pale-dusk px-4 py-1.5 font-sans text-[0.68rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold"
                >
                  Cancel
                </button>
              </div>
              {now && <span className="truncate font-sans text-[0.7rem] text-brand-slate">Now: {now}</span>}
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <span className="font-sans text-[0.72rem] tabular-nums text-brand-slate">
                {chosen.length === 0 ? 'Nothing ticked.' : `${plural(files, 'file')} · ${size(total, totalApprox)}`}
              </span>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-brand-pale-dusk px-4 py-2 font-sans text-[0.68rem] font-semibold uppercase tracking-label text-brand-slate transition-colors hover:text-brand-indigo"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={start}
                  disabled={loading || chosen.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <DownloadIcon />
                  {unticked.size === 0 ? 'Download everything' : 'Download the ticked files'} · {size(total, totalApprox)}
                </button>
              </div>
            </div>
          )}

          {!busy && !loading && total > MEMORY_WARN_BYTES && !canStreamToDisk() && (
            <p className="mt-3 font-sans text-[0.72rem] leading-snug text-brand-umber">
              This browser builds the whole zip in memory before saving it. For a download this size, use Chrome or
              Edge, which write it straight to disk, or untick the largest rows.
            </p>
          )}
          {notice && (
            <p role="status" className="mt-3 font-sans text-[0.72rem] font-semibold text-brand-indigo">
              {notice}
            </p>
          )}
        </section>
      )}
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13.5h10" />
    </svg>
  )
}

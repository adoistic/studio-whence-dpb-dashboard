'use client'

/**
 * WorkCharacters — the Characters tab of any work: a comic, a subject, a programme,
 * or the whole studio.
 *
 * Adnan, 2026-10-19: "When I click on Characters, I should be able to see all the
 * drawn, undrawn, and generalized characters there. I should be able to download
 * them individually, select a few, download them as a zip, or download all."
 *
 * One component for every scope. It receives the casts of the comics in view and folds
 * them into one list (`mergeCasts`), so a character staged by three books of a
 * programme is one entry that names all three. Every version is shown: the drawn ones
 * as their sheet, the ones still owed as a labelled placeholder, and a stock extra
 * whose look lives in the page prompt as exactly that — a cast sheet that hides what is
 * missing reads as finished, which is the opposite of what it is opened for.
 *
 * SPEED. The grid shows 800 px thumbnails, and only for the characters on screen (24
 * at a time). Full sheets are fetched only when someone opens or downloads one. A zip
 * is streamed in the browser while the sheets arrive (`downloadZip`), so nothing waits
 * for a server to build anything.
 *
 * Every image is a gated R2 key resolved to a short-lived URL at render time; no
 * artwork ships in this public repo.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  castTotals,
  drawnVersions,
  filterCharacters,
  linesOf,
  matchesFilter,
  mergeCasts,
  type CastDoc,
  type CastFilter,
  type WorkCharacter,
  type WorkVersion,
} from '@/lib/castModel'
import {
  downloadKey,
  downloadZip,
  formatBytes,
  safeFilename,
  uniquePaths,
  ZIP_FILE_MAX,
  ZIP_FOLDER_MAX,
  type ZipItem,
  type ZipProgress,
} from '@/lib/downloads'
import { useResolved, refreshResolved } from '@/lib/useResolved'

const PAGE_SIZE = 24

const FILTERS: { key: CastFilter; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'drawn', label: 'Drawn' },
  { key: 'undrawn', label: 'Not drawn yet' },
  { key: 'generalized', label: 'Generalised' },
]

const PILL = 'rounded-full border px-3 py-1 font-sans text-[0.68rem] uppercase tracking-label transition-colors'
const PILL_ON = 'border-brand-indigo bg-brand-indigo text-white'
const PILL_OFF = 'border-brand-pale-dusk text-brand-slate hover:border-brand-indigo hover:text-brand-indigo'
const BTN =
  'inline-flex items-center gap-2 rounded-md border border-brand-pale-dusk bg-white px-3 py-1.5 font-sans text-[0.68rem] uppercase tracking-label text-brand-indigo transition-colors hover:border-brand-indigo disabled:cursor-not-allowed disabled:opacity-50'

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

/** `3, 5–9, 12` — consecutive pages collapse, so a lead's forty pages stay one line. */
export function pageRanges(pages: number[], cap = 10): string {
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b)
  const runs: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    runs.push(j > i ? `${sorted[i]}–${sorted[j]}` : `${sorted[i]}`)
    i = j + 1
  }
  if (runs.length <= cap) return runs.join(', ')
  return `${runs.slice(0, cap).join(', ')} +${runs.length - cap} more`
}

function extOf(key: string | undefined): string {
  const m = /\.([a-z0-9]+)$/i.exec(key ?? '')
  return m ? `.${m[1].toLowerCase()}` : '.png'
}

export function versionFileName(c: Pick<WorkCharacter, 'name'>, v: Pick<WorkVersion, 'label' | 'key'>): string {
  const stem = `${c.name} — ${v.label.replace(/\s*\(cast library\)$/, '')}`
  return `${safeFilename(stem, 'sheet', ZIP_FILE_MAX)}${extOf(v.key)}`
}

/** The zip's layout: one folder per character under one folder for the work. */
export function zipItemsFor(
  title: string,
  picked: { character: WorkCharacter; version: WorkVersion }[],
): { root: string; items: ZipItem[]; paths: Map<string, string> } {
  const root = `${safeFilename(title, 'work', ZIP_FOLDER_MAX)} — characters`
  const raw = picked.map(({ character, version }) =>
    `${root}/${safeFilename(character.name, 'character', ZIP_FOLDER_MAX)}/${versionFileName(character, version)}`)
  const paths = uniquePaths(raw)
  const map = new Map<string, string>()
  const items = picked.map(({ version }, i) => {
    map.set(version.uid, paths[i])
    return { path: paths[i], key: version.key!, bytes: version.bytes }
  })
  return { root, items, paths: map }
}

/** The README: the WHOLE cast, so a zip of a few sheets still says what else exists. */
export function castReadme(
  title: string,
  all: WorkCharacter[],
  paths: Map<string, string>,
  failed: string[],
  root: string,
): string {
  const t = castTotals(all)
  const lines = [
    `# ${title} — characters`,
    '',
    `Studio Whence · generated ${new Date().toISOString().slice(0, 10)}`,
    '',
    `${plural(t.characters, 'character')} · ${t.versionsDrawn} of ${t.versions} versions drawn` +
      (t.versionsOwed ? ` · ${t.versionsOwed} not drawn yet` : '') +
      (t.generalized ? ` · ${t.generalized} generalised` : ''),
    '',
    `This zip holds ${plural(paths.size, 'sheet')}. Every character the work stages is listed below, ` +
      'including the versions nobody has drawn yet and the generalised roles (unnamed walk-ons, ' +
      'crowds and stock extras).',
    '',
  ]
  for (const c of all) {
    const kind = c.kind === 'generalized' ? 'generalised' : c.kind === 'shared' ? 'shared cast' : 'named'
    const bits = [kind]
    if (c.appearances) bits.push(plural(c.appearances, 'page'))
    if (c.spoken) bits.push(plural(c.spoken, 'line'))
    lines.push(`## ${c.name} — ${bits.join(' · ')}`, '')
    if (c.role) lines.push(c.role, '')
    for (const v of c.versions) {
      const where = v.comics
        .filter((a) => a.pages.length)
        .map((a) => `${a.title} p${pageRanges(a.pages, 6)}`)
        .join('; ')
      const path = paths.get(v.uid)
      const state = path
        ? `\`${path.slice(root.length + 1)}\``
        : v.drawn ? 'drawn (not in this zip)' : v.text ? 'described in the page text' : 'NOT DRAWN YET'
      lines.push(`- ${v.label} — ${state}${where ? ` — ${where}` : ''}${v.unstaged ? ' — not staged on a page yet' : ''}`)
    }
    lines.push('')
  }
  if (failed.length) {
    lines.push('## Could not be fetched', '', ...failed.map((f) => `- ${f.slice(root.length + 1)}`), '')
  }
  return lines.join('\n')
}

// ─── the component ────────────────────────────────────────────────────────────

export function WorkCharacters({
  casts,
  loading = false,
  title,
  program,
  showComics = false,
  showLineFilter = false,
  lineTitles = {},
  emptyNote = 'No cast has been published for these books yet.',
}: {
  casts: CastDoc[] | null
  loading?: boolean
  /** The work's name — used in zip and file names. */
  title: string
  /** On a programme page: keep only the cast-library sheets tagged with it. */
  program?: string
  /** Name the books each character appears in (subject, programme and repo views). */
  showComics?: boolean
  showLineFilter?: boolean
  lineTitles?: Record<string, string>
  emptyNote?: string
}) {
  const all = useMemo(() => mergeCasts(casts ?? [], { program }), [casts, program])
  const [filter, setFilter] = useState<CastFilter>('all')
  const [q, setQ] = useState('')
  const [line, setLine] = useState('all')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<{ label: string; progress: ZipProgress | null; abort: AbortController } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null) // version uid

  const lines = useMemo(() => (showLineFilter ? linesOf(all) : []), [all, showLineFilter])
  const filtered = useMemo(() => filterCharacters(all, { filter, q, line }), [all, filter, q, line])
  const shown = filtered.slice(0, limit)
  const totals = useMemo(() => castTotals(all), [all])
  const counts = useMemo(() => {
    const base = filterCharacters(all, { q, line })
    return Object.fromEntries(FILTERS.map((f) => [f.key, base.filter((c) => matchesFilter(c, f.key)).length])) as Record<CastFilter, number>
  }, [all, q, line])

  const byVersion = useMemo(() => {
    const m = new Map<string, { character: WorkCharacter; version: WorkVersion }>()
    for (const c of all) for (const v of c.versions) m.set(v.uid, { character: c, version: v })
    return m
  }, [all])

  // Only what is on screen resolves: a 700-strong cast must not cost 30 presigns.
  const thumbKeys = useMemo(
    () => shown.flatMap((c) => c.versions.filter((v) => v.drawn && v.thumb).map((v) => v.thumb!)),
    [shown],
  )
  const thumbs = useResolved(thumbKeys)

  // A selection outlives a filter change and a parent re-render, but never a change
  // of work: keyed on WHICH books are in view, not on the array's identity (a parent
  // that passes `[cast]` hands over a new array on every render).
  const workKey = useMemo(() => (casts ?? []).map((c) => c.comicId).sort().join('|'), [casts])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(new Set())
    setLimit(PAGE_SIZE)
  }, [workKey])

  const picked = useMemo(
    () => Array.from(selected).map((uid) => byVersion.get(uid)).filter((x): x is NonNullable<typeof x> => !!x && !!x.version.key),
    [selected, byVersion],
  )
  const pickedBytes = picked.reduce((n, p) => n + (p.version.bytes ?? 0), 0)
  const filteredDrawn = useMemo(() => drawnVersions(filtered), [filtered])
  const allFilteredSelected = filteredDrawn.length > 0 && filteredDrawn.every((p) => selected.has(p.version.uid))

  const toggle = useCallback((uids: string[], on?: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const turnOn = on ?? uids.some((u) => !next.has(u))
      for (const u of uids) {
        if (turnOn) next.add(u)
        else next.delete(u)
      }
      return next
    })
  }, [])

  const runZip = useCallback(
    (label: string, entries: { character: WorkCharacter; version: WorkVersion }[], name: string) => {
      if (busy || !entries.length) return
      const abort = new AbortController()
      setNotice(null)
      setBusy({ label, progress: null, abort })
      const { root, items, paths } = zipItemsFor(title, entries)
      // Straight from the click: the save dialog needs the click's activation.
      downloadZip(name, items, {
        signal: abort.signal,
        onProgress: (progress) => setBusy((b) => (b ? { ...b, progress } : b)),
        readme: (failed) => castReadme(title, all, paths, failed, root),
        readmePath: `${root}/README.md`,
      })
        .then((r) => {
          if (r.cancelled) setNotice('Download cancelled.')
          else if (r.failed.length) setNotice(`${plural(r.failed.length, 'sheet')} could not be fetched; the README in the zip lists them.`)
          else setNotice(r.streamedToDisk ? 'Saved.' : 'Download ready — check your downloads.')
        })
        .catch(() => setNotice('The zip could not be built. Please try again.'))
        .finally(() => setBusy(null))
    },
    [busy, title, all],
  )

  const downloadOne = useCallback((c: WorkCharacter, v: WorkVersion) => {
    if (!v.key) return
    setNotice(null)
    downloadKey(v.key, versionFileName(c, v)).catch(() => setNotice('That sheet is not available to you.'))
  }, [])

  const downloadCharacter = useCallback((c: WorkCharacter) => {
    const mine = c.versions.filter((v) => v.drawn && v.key).map((version) => ({ character: c, version }))
    if (mine.length === 1) downloadOne(c, mine[0].version)
    else runZip(c.name, mine, `${safeFilename(title)} — ${safeFilename(c.name)}.zip`)
  }, [downloadOne, runZip, title])

  if (loading && !casts) {
    return <p role="status" className="py-16 font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">Loading the cast…</p>
  }
  if (!all.length) {
    return <p className="py-16 font-serif text-lg text-brand-slate">{emptyNote}</p>
  }

  const allDrawn = drawnVersions(all)
  const viewed = viewing ? byVersion.get(viewing) ?? null : null

  return (
    <div className="flex flex-col gap-8">
      {/* ── Totals + download all ───────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-serif text-lg text-brand-umber">
            {plural(totals.characters, 'character')} · {totals.versionsDrawn} of {plural(totals.versions, 'version')} drawn
            {totals.versionsOwed > 0 && <span className="text-brand-slate"> · {totals.versionsOwed} not drawn yet</span>}
          </p>
          <p className="mt-1 font-sans text-[0.68rem] uppercase tracking-label text-brand-slate">
            {totals.generalized > 0 && <>{totals.generalized} generalised · </>}
            {showComics && totals.comics > 0 ? `across ${plural(totals.comics, 'book')}` : `${formatBytes(totals.bytesDrawn)} of sheets`}
          </p>
        </div>
        <button
          type="button"
          className={BTN}
          disabled={!!busy || allDrawn.length === 0}
          onClick={() => runZip('Everything', allDrawn, `${safeFilename(title)} — characters.zip`)}
        >
          <DownloadIcon />
          Download all · {allDrawn.length} {allDrawn.length === 1 ? 'sheet' : 'sheets'} · {formatBytes(totals.bytesDrawn)}
        </button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-y border-brand-pale-dusk py-4">
        {lines.length > 1 && (
          <div role="group" aria-label="Filter by line" className="flex flex-wrap gap-2">
            {['all', ...lines].map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={line === l}
                onClick={() => { setLine(l); setLimit(PAGE_SIZE) }}
                className={`${PILL} ${line === l ? PILL_ON : PILL_OFF}`}
              >
                {l === 'all' ? 'All lines' : lineTitles[l] ?? l}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter characters" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => { setFilter(f.key); setLimit(PAGE_SIZE) }}
                className={`${PILL} ${filter === f.key ? PILL_ON : PILL_OFF}`}
              >
                {f.label} <span className="opacity-70">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 font-sans text-[0.68rem] uppercase tracking-label text-brand-slate">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-indigo"
              checked={allFilteredSelected}
              disabled={filteredDrawn.length === 0}
              onChange={(e) => toggle(filteredDrawn.map((p) => p.version.uid), e.target.checked)}
            />
            Select all shown
          </label>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setLimit(PAGE_SIZE) }}
            placeholder="Find a character…"
            aria-label="Find a character"
            className="w-full rounded-md border border-brand-pale-dusk bg-white px-3 py-1.5 font-serif text-sm text-brand-indigo outline-none focus:border-brand-indigo sm:w-60"
          />
        </div>
      </div>

      {/* ── The cast ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-10">
        {shown.map((c) => (
          <CharacterRow
            key={c.uid}
            character={c}
            thumbs={thumbs}
            selected={selected}
            showComics={showComics}
            onToggle={toggle}
            onOpen={setViewing}
            onDownload={downloadOne}
            onDownloadCharacter={downloadCharacter}
            busy={!!busy}
          />
        ))}
        {filtered.length === 0 && <p className="font-serif text-brand-slate">No character matches that.</p>}
      </div>

      {shown.length < filtered.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="mx-auto rounded-md border border-brand-pale-dusk px-5 py-2 font-sans text-[0.68rem] uppercase tracking-label text-brand-slate transition-colors hover:border-brand-indigo hover:text-brand-indigo"
        >
          Show more — {filtered.length - shown.length} to go
        </button>
      )}

      {/* ── Selection / progress bar ────────────────────────────────── */}
      {(selected.size > 0 || busy || notice) && (
        <div
          role="region"
          aria-label="Selection"
          className="sticky bottom-4 z-30 mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-brand-twilight-mid bg-brand-deep px-5 py-3 text-brand-cream shadow-[0_12px_40px_-12px_rgba(15,11,32,0.6)]"
        >
          {busy ? (
            <>
              <span className="font-serif" aria-live="polite">
                {busy.progress
                  ? `Zipping ${Math.min(busy.progress.done + 1, busy.progress.total)} of ${busy.progress.total}` +
                    (busy.progress.bytesTotal ? ` · ${formatBytes(busy.progress.bytesDone)} of ${formatBytes(busy.progress.bytesTotal)}` : '')
                  : 'Preparing the zip…'}
              </span>
              {busy.progress && busy.progress.bytesTotal > 0 && (
                <span className="h-1 min-w-24 flex-1 overflow-hidden rounded-full bg-brand-twilight-mid">
                  <span
                    className="block h-full bg-brand-gold transition-[width]"
                    style={{ width: `${Math.min(100, (busy.progress.bytesDone / busy.progress.bytesTotal) * 100)}%` }}
                  />
                </span>
              )}
              <button type="button" onClick={() => busy.abort.abort()} className="ml-auto font-sans text-[0.68rem] uppercase tracking-label text-brand-pale-dusk/80 hover:text-white">
                Cancel
              </button>
            </>
          ) : selected.size > 0 ? (
            <>
              <span className="font-serif">
                {plural(picked.length, 'sheet')} selected{pickedBytes ? ` · ${formatBytes(pickedBytes)}` : ''}
              </span>
              <button
                type="button"
                onClick={() => runZip('Selection', picked, `${safeFilename(title)} — ${picked.length} character sheets.zip`)}
                className="ml-auto inline-flex items-center gap-2 rounded-md bg-brand-gold px-3 py-1.5 font-sans text-[0.68rem] font-semibold uppercase tracking-label text-brand-deep hover:brightness-105"
              >
                <DownloadIcon /> Download .zip
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="font-sans text-[0.68rem] uppercase tracking-label text-brand-pale-dusk/80 hover:text-white">
                Clear
              </button>
            </>
          ) : (
            <>
              <span className="font-serif" role="status">{notice}</span>
              <button type="button" onClick={() => setNotice(null)} className="ml-auto font-sans text-[0.68rem] uppercase tracking-label text-brand-pale-dusk/80 hover:text-white">
                Dismiss
              </button>
            </>
          )}
          {busy === null && notice && selected.size > 0 && (
            <span className="w-full font-serif text-sm text-brand-pale-dusk/80" role="status">{notice}</span>
          )}
        </div>
      )}

      {viewed && (
        <SheetViewer
          entry={viewed}
          sequence={drawnVersions(filtered).map((p) => p.version.uid)}
          onNavigate={setViewing}
          onClose={() => setViewing(null)}
          onDownload={downloadOne}
        />
      )}
    </div>
  )
}

// ─── one character ────────────────────────────────────────────────────────────

const CharacterRow = memo(function CharacterRow({
  character: c,
  thumbs,
  selected,
  showComics,
  onToggle,
  onOpen,
  onDownload,
  onDownloadCharacter,
  busy,
}: {
  character: WorkCharacter
  thumbs: Record<string, string>
  selected: Set<string>
  showComics: boolean
  onToggle: (uids: string[], on?: boolean) => void
  onOpen: (uid: string) => void
  onDownload: (c: WorkCharacter, v: WorkVersion) => void
  onDownloadCharacter: (c: WorkCharacter) => void
  busy: boolean
}) {
  const drawn = c.versions.filter((v) => v.drawn && v.key)
  const mine = drawn.map((v) => v.uid)
  const on = mine.filter((u) => selected.has(u)).length
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (box.current) box.current.indeterminate = on > 0 && on < mine.length
  }, [on, mine.length])

  const owed = c.versions.filter((v) => !v.drawn && !v.text).length
  return (
    <article className="border-t border-brand-pale-dusk pt-6" aria-label={c.name}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          ref={box}
          type="checkbox"
          className="h-4 w-4 accent-brand-indigo"
          aria-label={`Select every drawn version of ${c.name}`}
          checked={mine.length > 0 && on === mine.length}
          disabled={mine.length === 0}
          onChange={(e) => onToggle(mine, e.target.checked)}
        />
        <h3 className="font-serif text-xl text-brand-indigo">{c.name}</h3>
        {c.kind === 'generalized' && (
          <span title="An unnamed role, a crowd or a stock extra" className="rounded-full border border-brand-lavender/60 px-2 py-0.5 font-sans text-[0.6rem] uppercase tracking-label text-brand-lavender">
            Generalised
          </span>
        )}
        {c.kind === 'shared' && (
          <span title="One locked design used across lines" className="rounded-full border border-brand-gold px-2 py-0.5 font-sans text-[0.6rem] uppercase tracking-label text-brand-gold">
            Shared cast
          </span>
        )}
        <span className="font-serif text-sm text-brand-slate">
          {[
            c.appearances ? plural(c.appearances, 'page') : null,
            c.spoken ? plural(c.spoken, 'line') : null,
            `${c.versions.filter((v) => v.drawn).length} of ${plural(c.versions.length, 'version')} drawn`,
            owed ? `${owed} still to draw` : null,
          ].filter(Boolean).join(' · ')}
        </span>
        {drawn.length > 0 && (
          <button type="button" className={`${BTN} ml-auto`} disabled={busy} onClick={() => onDownloadCharacter(c)}>
            <DownloadIcon /> {drawn.length === 1 ? 'Download' : `Download ${drawn.length}`}
          </button>
        )}
      </header>
      {c.role && <p className="mt-2 max-w-3xl font-serif text-brand-umber">{c.role}</p>}
      {showComics && c.comics.length > 0 && (
        <p className="mt-1 font-serif text-sm text-brand-slate">
          {c.comics.slice(0, 6).map((a, i) => (
            <span key={a.comicId}>
              {i > 0 && ' · '}
              <Link href={`/${a.line}/${a.slug}`} className="underline decoration-brand-pale-dusk underline-offset-4 hover:text-brand-indigo">
                {a.title}
              </Link>
            </span>
          ))}
          {c.comics.length > 6 && ` · +${c.comics.length - 6} more`}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {c.versions.map((v) => (
          <VersionTile
            key={v.uid}
            character={c}
            version={v}
            url={v.thumb ? thumbs[v.thumb] : undefined}
            selected={selected.has(v.uid)}
            showComics={showComics}
            onToggle={onToggle}
            onOpen={onOpen}
            onDownload={onDownload}
          />
        ))}
      </div>
    </article>
  )
})

function VersionTile({
  character: c,
  version: v,
  url,
  selected,
  showComics,
  onToggle,
  onOpen,
  onDownload,
}: {
  character: WorkCharacter
  version: WorkVersion
  url?: string
  selected: boolean
  showComics: boolean
  onToggle: (uids: string[], on?: boolean) => void
  onOpen: (uid: string) => void
  onDownload: (c: WorkCharacter, v: WorkVersion) => void
}) {
  const pages = v.comics.flatMap((a) => a.pages)
  const where = showComics && v.comics.length > 1
    ? `${plural(pages.length, 'page')} · ${plural(v.comics.length, 'book')}`
    : pages.length ? `p${pageRanges(pages, 4)}` : ''
  return (
    <figure className="flex flex-col gap-1.5">
      <div
        className={`group relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-md border bg-white transition-shadow ${
          selected ? 'border-brand-indigo ring-2 ring-brand-indigo/40' : v.drawn ? 'border-brand-pale-dusk' : 'border-dashed border-brand-pale-dusk'
        }`}
      >
        {v.drawn ? (
          <button
            type="button"
            onClick={() => onOpen(v.uid)}
            className="h-full w-full cursor-zoom-in"
            aria-label={`Open ${c.name} — ${v.label}`}
          >
            {url ? (
              // Presigned R2 URLs expire and are per-request, so next/image cannot
              // optimise them in this static export; the thumbnail is already small.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={`${c.name} — ${v.label}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-contain"
                onError={() => v.thumb && refreshResolved(v.thumb)}
              />
            ) : (
              <span className="block h-full w-full animate-pulse bg-brand-threshold" />
            )}
          </button>
        ) : (
          <span className="px-3 text-center font-serif text-sm text-brand-slate">
            {v.text ? 'Described in the page text' : 'Not drawn yet'}
            <span className="mt-1 block font-sans text-[0.58rem] uppercase tracking-label text-brand-slate/60">
              {v.text ? 'no sheet needed' : 'placeholder'}
            </span>
          </span>
        )}
        {v.drawn && v.key && (
          <>
            <label
              className={`absolute left-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow-sm transition-opacity ${
                selected ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
              }`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-indigo"
                checked={selected}
                onChange={(e) => onToggle([v.uid], e.target.checked)}
                aria-label={`Select ${c.name} — ${v.label}`}
              />
            </label>
            <button
              type="button"
              onClick={() => onDownload(c, v)}
              aria-label={`Download ${c.name} — ${v.label}`}
              title="Download this sheet"
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-brand-indigo shadow-sm transition-opacity hover:bg-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
            >
              <DownloadIcon />
            </button>
          </>
        )}
      </div>
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="truncate font-sans text-[0.66rem] uppercase tracking-label text-brand-indigo" title={v.label}>
          {v.label}
        </span>
        {v.unstaged ? (
          <span className="shrink-0 font-sans text-[0.58rem] uppercase tracking-label text-brand-gold">not staged yet</span>
        ) : where ? (
          <span className="shrink-0 font-serif text-xs text-brand-slate">{where}</span>
        ) : null}
      </figcaption>
    </figure>
  )
}

// ─── the full sheet ───────────────────────────────────────────────────────────

function SheetViewer({
  entry,
  sequence,
  onNavigate,
  onClose,
  onDownload,
}: {
  entry: { character: WorkCharacter; version: WorkVersion }
  sequence: string[]
  onNavigate: (uid: string) => void
  onClose: () => void
  onDownload: (c: WorkCharacter, v: WorkVersion) => void
}) {
  const { character: c, version: v } = entry
  const urls = useResolved(v.key ? [v.key] : [])
  const thumbs = useResolved(v.thumb ? [v.thumb] : [])
  const full = v.key ? urls[v.key] : undefined
  const preview = v.thumb ? thumbs[v.thumb] : undefined
  const at = sequence.indexOf(v.uid)
  const prev = at > 0 ? sequence[at - 1] : null
  const next = at >= 0 && at < sequence.length - 1 ? sequence[at + 1] : null
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const body = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = body
      before?.focus?.()
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && prev) onNavigate(prev)
      else if (e.key === 'ArrowRight' && next) onNavigate(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onClose, onNavigate])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${c.name} — ${v.label}`}
      className="fixed inset-0 z-50 flex flex-col bg-canvas-dark/95 text-brand-cream"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        <span className="font-serif text-xl">{c.name}</span>
        <span className="font-sans text-[0.68rem] uppercase tracking-label text-brand-gold">{v.label}</span>
        <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-pale-dusk/60">
          {at >= 0 ? `${at + 1} of ${sequence.length}` : ''}
        </span>
        <button
          type="button"
          onClick={() => onDownload(c, v)}
          className="ml-auto inline-flex items-center gap-2 rounded-md bg-brand-gold px-3 py-1.5 font-sans text-[0.68rem] font-semibold uppercase tracking-label text-brand-deep hover:brightness-105"
        >
          <DownloadIcon /> Download {formatBytes(v.bytes ?? 0)}
        </button>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md px-2 py-1 font-sans text-lg leading-none text-brand-pale-dusk hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        {prev && (
          <button type="button" onClick={() => onNavigate(prev)} aria-label="Previous sheet" className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 text-2xl text-white hover:bg-black/60">
            ‹
          </button>
        )}
        {/* The thumbnail shows at once; the full sheet replaces it when it lands. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={full ?? preview}
          alt={`${c.name} — ${v.label}`}
          className="max-h-full max-w-full rounded-sm bg-white object-contain"
          onError={() => v.key && refreshResolved(v.key)}
        />
        {next && (
          <button type="button" onClick={() => onNavigate(next)} aria-label="Next sheet" className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 text-2xl text-white hover:bg-black/60">
            ›
          </button>
        )}
      </div>
      {(v.look || v.comics.length > 0) && (
        <div className="max-h-[22vh] overflow-y-auto border-t border-white/10 px-5 py-3 font-serif text-sm text-brand-pale-dusk/85">
          {v.look && <p className="max-w-4xl">{v.look}</p>}
          {v.comics.length > 0 && (
            <p className="mt-1 text-brand-pale-dusk/60">
              {v.comics.map((a) => `${a.title}${a.pages.length ? ` p${pageRanges(a.pages, 8)}` : ''}`).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M2.5 12.5h11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

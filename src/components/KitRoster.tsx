'use client'

/**
 * KitRoster — the brand kit: logos, products and places, era by era.
 *
 * The sibling of `CharacterRoster`, and the same idea: a locked asset with
 * versions, laid out so that what is MISSING is as visible as what is done.
 *
 * The one thing this surface must carry that a logo gallery would not is the
 * ERA. A mark is a property of the year — Apple's carried a wordmark until 1984
 * and stood alone after it — so every sheet is shown under its span, in order,
 * and an unverified span is labelled as unverified rather than left to look
 * researched.
 *
 * No artwork ships in this public repo; each sheet is an R2 key resolved to a
 * short-lived signed URL behind the auth gate.
 */

import { useMemo, useState } from 'react'
import {
  eraSpan, kitTotals, markKind, selectMarks,
  type KitDoc, type KitEra, type KitMark, type MarkKind,
} from '@/lib/kit'
import { useResolved } from '@/lib/useResolved'

const PAGE_SIZE = 24

const KIND_FILTERS: { key: MarkKind | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'logo', label: 'Logos' },
  { key: 'product', label: 'Products' },
  { key: 'building', label: 'Places' },
]

const STATE_FILTERS: { key: 'all' | 'drawn' | 'owed' | 'unverified'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drawn', label: 'Drawn' },
  { key: 'owed', label: 'Still owed' },
  { key: 'unverified', label: 'Dates unverified' },
]

function plural(n: number, word: string) {
  return n === 1 ? word : `${word}s`
}

export default function KitRoster({ docs }: { docs: KitDoc[] }) {
  const [kind, setKind] = useState<MarkKind | 'all'>('all')
  const [state, setState] = useState<'all' | 'drawn' | 'owed' | 'unverified'>('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const totals = useMemo(() => kitTotals(docs), [docs])
  const marks = useMemo(
    () => selectMarks(docs, { kind, state, query }),
    [docs, kind, state, query],
  )
  const shown = marks.slice(0, limit)

  // Resolve only what is mounted, as the character roster does — presigning
  // every sheet up front is round trips nobody is looking at.
  const keys = useMemo(
    () => shown.flatMap((m) => m.eras.map((e) => e.key).filter((k): k is string => !!k)),
    [shown],
  )
  const urls = useResolved(keys)

  const PILL =
    'rounded-full border px-3 py-1 font-sans text-[0.68rem] uppercase tracking-label transition-colors'
  const on = 'border-brand-indigo bg-brand-indigo text-white'
  const off = 'border-brand-pale-dusk text-brand-slate hover:border-brand-indigo'

  function change(fn: () => void) {
    fn()
    setLimit(PAGE_SIZE)
  }

  if (!docs.length) {
    return (
      <p className="font-serif text-brand-slate">
        No brand kit has been published yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-serif text-brand-umber">
          {totals.marks} {plural(totals.marks, 'mark')} ·{' '}
          {totals.drawn} of {totals.eras} {plural(totals.eras, 'era')} drawn
          {totals.owed > 0 && (
            <span className="text-brand-slate"> · {totals.owed} with no sheet yet</span>
          )}
        </p>
        <p className="mt-1 font-sans text-[0.68rem] uppercase tracking-label text-brand-slate">
          {totals.pages} page {plural(totals.pages, 'reference')} across the scripts ·{' '}
          {totals.unverified} {plural(totals.unverified, 'era')} with dates not yet verified
        </p>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-y border-brand-pale-dusk py-4">
        <div role="group" aria-label="Filter by kind" className="flex flex-wrap items-center gap-2">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={kind === f.key}
              onClick={() => change(() => setKind(f.key))}
              className={`${PILL} ${kind === f.key ? on : off}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter by state" className="flex flex-wrap gap-2">
            {STATE_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={state === f.key}
                onClick={() => change(() => setState(f.key))}
                className={`${PILL} ${state === f.key ? on : off}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2">
            <span className="sr-only">Search marks</span>
            <input
              type="search"
              value={query}
              onChange={(e) => change(() => setQuery(e.target.value))}
              placeholder="Search a brand or book…"
              className="w-56 rounded-full border border-brand-pale-dusk px-4 py-1 font-sans text-sm text-brand-umber placeholder:text-brand-slate focus:border-brand-indigo focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* ── Marks ───────────────────────────────────────────────────────── */}
      {shown.length === 0 ? (
        <p className="font-serif text-brand-slate">Nothing matches those filters.</p>
      ) : (
        <ul className="flex flex-col gap-10">
          {shown.map((m) => (
            <MarkRow key={`${m.domain}/${m.slug}`} mark={m} urls={urls} />
          ))}
        </ul>
      )}

      {marks.length > shown.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="self-center rounded-full border border-brand-indigo px-6 py-2 font-sans text-[0.68rem] uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-indigo hover:text-white"
        >
          Show more ({marks.length - shown.length} left)
        </button>
      )}
    </div>
  )
}

function MarkRow({
  mark,
  urls,
}: {
  mark: KitMark & { domain: string }
  urls: Record<string, string>
}) {
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-serif text-lg text-brand-umber">{mark.name}</h3>
        <p className="font-sans text-[0.68rem] uppercase tracking-label text-brand-slate">
          {markKind(mark)}
          {mark.yearSpan && ` · ${mark.yearSpan[0]}–${mark.yearSpan[1]}`}
          {mark.pages > 0 &&
            ` · ${mark.pages} ${mark.pages === 1 ? 'page' : 'pages'} in ${mark.books.length} ${mark.books.length === 1 ? 'book' : 'books'}`}
        </p>
      </div>
      {mark.books.length > 0 && (
        <p className="mt-1 font-sans text-xs text-brand-slate">
          {mark.books.join(' · ')}
        </p>
      )}
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {mark.eras.map((e) => (
          <EraCard key={e.slug} era={e} url={e.key ? urls[e.key] : undefined} name={mark.name} />
        ))}
      </ul>
    </li>
  )
}

function EraCard({ era, url, name }: { era: KitEra; url?: string; name: string }) {
  return (
    <li className="flex flex-col gap-2">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded border border-brand-pale-dusk bg-white">
        {era.drawn && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`${name}, the form used ${eraSpan(era)}`}
            className="max-h-full max-w-full object-contain"
            loading="lazy"
          />
        ) : (
          <span className="px-2 text-center font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
            {era.drawn ? 'Loading' : 'Not drawn yet'}
          </span>
        )}
      </div>
      <div>
        <p className="font-sans text-xs font-semibold text-brand-umber">{eraSpan(era)}</p>
        {era.form && (
          <p className="mt-0.5 font-serif text-xs leading-snug text-brand-slate">{era.form}</p>
        )}
        <p className="mt-1 flex flex-wrap gap-x-2 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
          {/* An adopted sheet is the real vector, kept exact. A redrawn one is
              ours. Worth saying, because it changes how much to trust the shape. */}
          {era.adopted && <span>exact vector</span>}
          {!era.verified && <span className="text-brand-indigo">dates unverified</span>}
        </p>
      </div>
    </li>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { useMembers, type Member } from '@/lib/admin'
import {
  useAllocation, setGrants, addGrant, removeGrant,
  type Allocation, type Grants,
} from '@/lib/allocation'
import { useLines, useFigures, useComics } from '@/lib/catalog'
import type { Comic, Figure, Line } from '@/types/content'

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** "sachin-tendulkar" → "Sachin Tendulkar" (display only; raw slug is stored). */
function titleCaseSlug(slug: string): string {
  return slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

/** A comic's stable id, matching the Firestore doc id `{line}__{slug}`. */
function comicId(c: Comic): string {
  return `${c.line}__${c.slug}`
}

// ── Section heading + chip atoms (mirror AdminPanel's brand styling) ───────────────

function SubHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h3 className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">{title}</h3>
      <span className="font-sans text-[0.65rem] text-brand-slate/70">{count}</span>
    </div>
  )
}

function GrantChip({ label, onRemove, removeLabel }: { label: string; onRemove: () => void; removeLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-pale-dusk bg-brand-pale-dusk/30 py-1 pl-3 pr-1 font-sans text-[0.75rem] text-brand-umber">
      {label}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-brand-slate transition-colors hover:bg-brand-gold/20 hover:text-brand-umber"
      >
        <span aria-hidden>×</span>
      </button>
    </span>
  )
}

const SELECT_CLS =
  'min-w-[12rem] rounded-md border border-brand-pale-dusk bg-brand-cream px-3 py-2 font-sans text-sm text-brand-umber focus:border-brand-indigo focus:outline-none'

function AddButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center rounded-full border border-brand-indigo bg-brand-indigo px-3 py-1.5 font-sans text-[0.7rem] uppercase tracking-label text-brand-cream transition-colors hover:bg-brand-indigo/90 disabled:cursor-not-allowed disabled:border-brand-pale-dusk disabled:bg-brand-pale-dusk/40 disabled:text-brand-slate"
    >
      Add
    </button>
  )
}

// ── Main section ───────────────────────────────────────────────────────────────────

export function AllocationsSection({ adminEmail }: { adminEmail: string }) {
  // The members list shares the admin panel's refresh cadence loosely; we read
  // it once on mount (refreshKey 0) — members rarely change mid-allocation.
  const members = useMembers(0)
  const lines = useLines()
  const figures = useFigures()
  const comics = useComics()

  const [selectedEmail, setSelectedEmail] = useState('')
  const [allocRefreshKey, setAllocRefreshKey] = useState(0)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const alloc = useAllocation(selectedEmail || null, allocRefreshKey)

  // comicId → subject_slug, so setGrants can derive figures_effective.
  const subjectByComic = useMemo<Record<string, string | undefined>>(() => {
    const cs = comics.data ?? []
    return Object.fromEntries(cs.map((c) => [comicId(c), c.subject_slug ?? undefined]))
  }, [comics.data])

  // Lookup tables for friendly chip / option labels.
  const lineTitle = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of lines.data ?? []) m.set(l.slug, l.title)
    return (slug: string) => m.get(slug) ?? slug
  }, [lines.data])

  const comicTitle = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of comics.data ?? []) m.set(comicId(c), c.title)
    return (id: string) => m.get(id) ?? id
  }, [comics.data])

  // A write runs the mutation, then bumps the alloc refresh key so the chips reload.
  const write = async (grants: Grants) => {
    setErrMsg(null)
    try {
      await setGrants(selectedEmail, grants, { adminEmail, subjectByComic })
      setAllocRefreshKey((k) => k + 1)
    } catch {
      setErrMsg('Couldn’t save allocation.')
    }
  }

  const memberList: Member[] = members.data ?? []
  const current = alloc.data

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="font-serif font-light text-brand-umber text-[1.4rem]">Allocations</h2>
        <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
          Assign works to a member
        </span>
      </div>

      <p className="mb-5 max-w-xl font-serif text-sm text-brand-umber/70 leading-relaxed">
        Pick a member, then grant them whole lines, figures, or individual comics.
        A member sees only what they’re assigned; admins and sub-admins see everything.
      </p>

      {errMsg && (
        <p role="alert" className="mb-4 rounded-md border border-brand-gold/60 bg-brand-gold/10 px-4 py-2 font-sans text-sm text-brand-umber">
          {errMsg}
        </p>
      )}

      {/* ── Member picker ──────────────────────────────────────────────── */}
      <div className="mb-6">
        <label htmlFor="alloc-member" className="mb-1 block font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
          Member
        </label>
        <select
          id="alloc-member"
          value={selectedEmail}
          onChange={(e) => { setSelectedEmail(e.target.value); setErrMsg(null) }}
          className={SELECT_CLS}
        >
          <option value="">Select a member…</option>
          {memberList.map((m) => (
            <option key={m.email} value={m.email}>
              {m.email}{m.role === 'sub_admin' ? ' (sub-admin)' : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedEmail && current && (
        <CurrentAndAdd
          alloc={current}
          lines={lines.data ?? []}
          figures={figures.data ?? []}
          comics={comics.data ?? []}
          lineTitle={lineTitle}
          comicTitle={comicTitle}
          onWrite={write}
        />
      )}
    </section>
  )
}

// ── Current grants + add controls (rendered once a member is chosen) ───────────────

function CurrentAndAdd({
  alloc, lines, figures, comics, lineTitle, comicTitle, onWrite,
}: {
  alloc: Allocation
  lines: Line[]
  figures: Figure[]
  comics: Comic[]
  lineTitle: (slug: string) => string
  comicTitle: (id: string) => string
  onWrite: (grants: Grants) => void
}) {
  const hasAny = alloc.lines.length + alloc.figures.length + alloc.comics.length > 0

  const remove = (kind: 'line' | 'figure' | 'comic', value: string) =>
    onWrite(removeGrant(alloc, kind, value))
  const add = (kind: 'line' | 'figure' | 'comic', value: string) =>
    onWrite(addGrant(alloc, kind, value))

  return (
    <div className="flex flex-col gap-8">
      {/* ── Current grants, grouped ─────────────────────────────────── */}
      <div>
        <h3 className="mb-3 font-serif text-brand-umber text-[1.05rem]">Current grants</h3>
        {!hasAny ? (
          <p className="rounded-lg border border-dashed border-brand-pale-dusk px-4 py-5 text-center font-sans text-sm text-brand-slate">
            No works allocated — this member sees nothing until you assign work.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <SubHeading title="Lines" count={alloc.lines.length} />
              {alloc.lines.length === 0 ? (
                <p className="font-sans text-xs text-brand-slate/70">None.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {alloc.lines.map((slug) => (
                    <GrantChip
                      key={slug}
                      label={lineTitle(slug)}
                      removeLabel={`Remove line ${lineTitle(slug)}`}
                      onRemove={() => remove('line', slug)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <SubHeading title="Figures" count={alloc.figures.length} />
              {alloc.figures.length === 0 ? (
                <p className="font-sans text-xs text-brand-slate/70">None.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {alloc.figures.map((slug) => (
                    <GrantChip
                      key={slug}
                      label={titleCaseSlug(slug)}
                      removeLabel={`Remove figure ${titleCaseSlug(slug)}`}
                      onRemove={() => remove('figure', slug)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <SubHeading title="Comics" count={alloc.comics.length} />
              {alloc.comics.length === 0 ? (
                <p className="font-sans text-xs text-brand-slate/70">None.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {alloc.comics.map((id) => (
                    <GrantChip
                      key={id}
                      label={comicTitle(id)}
                      removeLabel={`Remove comic ${comicTitle(id)}`}
                      onRemove={() => remove('comic', id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add controls ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-6">
        <AddLine lines={lines} granted={alloc.lines} onAdd={(slug) => add('line', slug)} />
        <AddFigure
          figures={figures}
          comics={comics}
          lines={lines}
          granted={alloc.figures}
          onAdd={(slug) => add('figure', slug)}
        />
        <AddComic
          comics={comics}
          lines={lines}
          comicTitle={comicTitle}
          granted={alloc.comics}
          onAdd={(id) => add('comic', id)}
        />
      </div>
    </div>
  )
}

// ── Add a line ─────────────────────────────────────────────────────────────────────

function AddLine({ lines, granted, onAdd }: { lines: Line[]; granted: string[]; onAdd: (slug: string) => void }) {
  const [sel, setSel] = useState('')
  const already = sel !== '' && granted.includes(sel)
  return (
    <div>
      <label htmlFor="alloc-add-line" className="mb-1 block font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
        Add a line
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="alloc-add-line"
          aria-label="Line to add"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className={SELECT_CLS}
        >
          <option value="">Select a line…</option>
          {lines.map((l) => (
            <option key={l.slug} value={l.slug}>{l.title}</option>
          ))}
        </select>
        <AddButton
          label="Add line grant"
          disabled={sel === '' || already}
          onClick={() => { onAdd(sel); setSel('') }}
        />
        {already && <span className="font-sans text-xs text-brand-slate">Already granted.</span>}
      </div>
    </div>
  )
}

// ── Add a figure ────────────────────────────────────────────────────────────────────

/** subject_slug → line, inferred from comics (figures carry no line field). */
function lineForSubject(comics: Comic[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of comics) if (c.subject_slug) m.set(c.subject_slug, c.line)
  return m
}

function AddFigure({
  figures, comics, lines, granted, onAdd,
}: {
  figures: Figure[]
  comics: Comic[]
  lines: Line[]
  granted: string[]
  onAdd: (slug: string) => void
}) {
  const [lineFilter, setLineFilter] = useState('')
  const [sel, setSel] = useState('')
  const subjectLine = useMemo(() => lineForSubject(comics), [comics])

  const visible = useMemo(() => {
    if (!lineFilter) return figures
    // Keep figures whose comics live in the chosen line; if a figure can't be
    // mapped to any line (no comics yet), drop it under an active filter.
    return figures.filter((f) => subjectLine.get(f.slug) === lineFilter)
  }, [figures, lineFilter, subjectLine])

  const already = sel !== '' && granted.includes(sel)
  return (
    <div>
      <label htmlFor="alloc-add-figure" className="mb-1 block font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
        Add a figure
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter figures by line"
          value={lineFilter}
          onChange={(e) => { setLineFilter(e.target.value); setSel('') }}
          className={SELECT_CLS}
        >
          <option value="">All lines</option>
          {lines.map((l) => (
            <option key={l.slug} value={l.slug}>{l.title}</option>
          ))}
        </select>
        <select
          id="alloc-add-figure"
          aria-label="Figure to add"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className={SELECT_CLS}
        >
          <option value="">Select a figure…</option>
          {visible.map((f) => (
            <option key={f.slug} value={f.slug}>{titleCaseSlug(f.slug)}</option>
          ))}
        </select>
        <AddButton
          label="Add figure grant"
          disabled={sel === '' || already}
          onClick={() => { onAdd(sel); setSel('') }}
        />
        {already && <span className="font-sans text-xs text-brand-slate">Already granted.</span>}
      </div>
    </div>
  )
}

// ── Add a comic ─────────────────────────────────────────────────────────────────────

function AddComic({
  comics, lines, comicTitle, granted, onAdd,
}: {
  comics: Comic[]
  lines: Line[]
  comicTitle: (id: string) => string
  granted: string[]
  onAdd: (id: string) => void
}) {
  const [lineFilter, setLineFilter] = useState('')
  const [figureFilter, setFigureFilter] = useState('')
  const [sel, setSel] = useState('')

  // Figures available in the chosen line (by comic subjects).
  const figuresInLine = useMemo(() => {
    const seen = new Map<string, string>() // subject_slug → display
    for (const c of comics) {
      if (lineFilter && c.line !== lineFilter) continue
      if (c.subject_slug) seen.set(c.subject_slug, titleCaseSlug(c.subject_slug))
    }
    return Array.from(seen.entries()).map(([slug, name]) => ({ slug, name }))
  }, [comics, lineFilter])

  // Comics filtered by chosen line + figure.
  const visible = useMemo(() => {
    return comics.filter((c) => {
      if (lineFilter && c.line !== lineFilter) return false
      if (figureFilter && c.subject_slug !== figureFilter) return false
      return true
    })
  }, [comics, lineFilter, figureFilter])

  const already = sel !== '' && granted.includes(sel)
  return (
    <div>
      <label htmlFor="alloc-add-comic" className="mb-1 block font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
        Add a comic
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter comics by line"
          value={lineFilter}
          onChange={(e) => { setLineFilter(e.target.value); setFigureFilter(''); setSel('') }}
          className={SELECT_CLS}
        >
          <option value="">All lines</option>
          {lines.map((l) => (
            <option key={l.slug} value={l.slug}>{l.title}</option>
          ))}
        </select>
        <select
          aria-label="Filter comics by figure"
          value={figureFilter}
          onChange={(e) => { setFigureFilter(e.target.value); setSel('') }}
          className={SELECT_CLS}
        >
          <option value="">All figures</option>
          {figuresInLine.map((f) => (
            <option key={f.slug} value={f.slug}>{f.name}</option>
          ))}
        </select>
        <select
          id="alloc-add-comic"
          aria-label="Comic to add"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className={SELECT_CLS}
        >
          <option value="">Select a comic…</option>
          {visible.map((c) => (
            <option key={comicId(c)} value={comicId(c)}>{comicTitle(comicId(c))}</option>
          ))}
        </select>
        <AddButton
          label="Add comic grant"
          disabled={sel === '' || already}
          onClick={() => { onAdd(sel); setSel('') }}
        />
        {already && <span className="font-sans text-xs text-brand-slate">Already granted.</span>}
      </div>
    </div>
  )
}

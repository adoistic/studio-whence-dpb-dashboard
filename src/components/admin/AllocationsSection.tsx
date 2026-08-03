'use client'

/**
 * Access — who sees what, in one table.
 *
 * The old version hid every member's grants behind a dropdown: to find out who
 * could see a comic you had to select members one at a time. This one leads
 * with the answer — a table of every member and a plain-English summary of what
 * they can see — and puts the editor behind an Edit toggle on each row.
 *
 * Editing is one composer, not four stacked forms: pick WHAT you are granting
 * (whole line / series / figure / single comic), pick the thing, press Grant.
 * Removal is the × on a chip. Every write is the full grant set (setGrants),
 * exactly as before — only the surface changed.
 */

import { useMemo, useState } from 'react'
import { useMembers, type Member } from '@/lib/admin'
import {
  addGrant,
  removeGrant,
  setGrants,
  useAllAllocations,
  type Allocation,
  type GrantKind,
  type Grants,
} from '@/lib/allocation'
import { useLines, useFigures, useComics } from '@/lib/catalog'
import type { Comic } from '@/types/content'

// ── Small helpers ─────────────────────────────────────────────────────────────

function titleCaseSlug(slug: string): string {
  return slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

function comicId(c: Comic): string {
  return `${c.line}__${c.slug}`
}

const EMPTY = (email: string): Allocation => ({
  email, lines: [], figures: [], comics: [], programs: [], figures_effective: [],
})

const grantCount = (a: Allocation) =>
  a.lines.length + a.programs.length + a.figures.length + a.comics.length

const SELECT_CLS =
  'rounded-md border border-brand-pale-dusk bg-brand-cream px-3 py-2 font-sans text-[0.8rem] text-brand-umber focus:border-brand-indigo focus:outline-none'

// ── Chips ─────────────────────────────────────────────────────────────────────

function GrantChip({
  label, kindLabel, onRemove, removeLabel,
}: { label: string; kindLabel: string; onRemove: () => void; removeLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-pale-dusk bg-brand-pale-dusk/30 py-1 pl-3 pr-1 font-sans text-[0.75rem] text-brand-umber">
      {label}
      <span className="font-sans text-[0.58rem] uppercase tracking-label text-brand-slate">{kindLabel}</span>
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

// ── The grant composer: what → which → Grant ──────────────────────────────────

const KIND_LABEL: Record<GrantKind, string> = {
  line: 'Whole line',
  program: 'Series (current & future books)',
  figure: 'Figure (all their books + research)',
  comic: 'Single comic',
}

function GrantComposer({
  alloc, lineOptions, programOptions, figureOptions, comicOptions, onGrant,
}: {
  alloc: Allocation
  lineOptions: { slug: string; title: string }[]
  programOptions: { slug: string; title: string }[]
  figureOptions: { slug: string; line: string }[]
  comicOptions: Comic[]
  onGrant: (kind: GrantKind, value: string) => void
}) {
  const [kind, setKind] = useState<GrantKind>('line')
  const [lineFilter, setLineFilter] = useState('')
  const [sel, setSel] = useState('')

  const granted: Record<GrantKind, string[]> = {
    line: alloc.lines, program: alloc.programs, figure: alloc.figures, comic: alloc.comics,
  }

  // The options for the current kind, narrowed by the optional line filter.
  const options: { value: string; label: string }[] = useMemo(() => {
    switch (kind) {
      case 'line':
        return lineOptions.map((l) => ({ value: l.slug, label: l.title }))
      case 'program':
        return programOptions.map((p) => ({ value: p.slug, label: p.title }))
      case 'figure':
        return figureOptions
          .filter((f) => !lineFilter || f.line === lineFilter)
          .map((f) => ({ value: f.slug, label: titleCaseSlug(f.slug) }))
      case 'comic':
        return comicOptions
          .filter((c) => !lineFilter || c.line === lineFilter)
          .map((c) => ({ value: comicId(c), label: c.title || c.slug }))
    }
  }, [kind, lineFilter, lineOptions, programOptions, figureOptions, comicOptions])

  const already = sel !== '' && granted[kind].includes(sel)
  const showLineFilter = kind === 'figure' || kind === 'comic'

  return (
    <div className="rounded-lg border border-brand-pale-dusk bg-brand-pale-dusk/20 p-4">
      <div className="mb-2 font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">
        Give access
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="What to grant"
          value={kind}
          onChange={(e) => { setKind(e.target.value as GrantKind); setSel(''); setLineFilter('') }}
          className={SELECT_CLS}
        >
          {(Object.keys(KIND_LABEL) as GrantKind[]).map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>

        {showLineFilter ? (
          <select
            aria-label="Narrow by line"
            value={lineFilter}
            onChange={(e) => { setLineFilter(e.target.value); setSel('') }}
            className={SELECT_CLS}
          >
            <option value="">Any line</option>
            {lineOptions.map((l) => (
              <option key={l.slug} value={l.slug}>{l.title}</option>
            ))}
          </select>
        ) : null}

        <select
          aria-label="Which one"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className={`${SELECT_CLS} min-w-[14rem]`}
        >
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          type="button"
          aria-label="Grant access"
          disabled={sel === '' || already}
          onClick={() => { onGrant(kind, sel); setSel('') }}
          className="inline-flex items-center rounded-full border border-brand-indigo bg-brand-indigo px-4 py-1.5 font-sans text-[0.7rem] uppercase tracking-label text-brand-cream transition-colors hover:bg-brand-indigo/90 disabled:cursor-not-allowed disabled:border-brand-pale-dusk disabled:bg-brand-pale-dusk/40 disabled:text-brand-slate"
        >
          Grant
        </button>
        {already && <span className="font-sans text-xs text-brand-slate">Already granted.</span>}
      </div>
    </div>
  )
}

// ── One member's row + expandable editor ──────────────────────────────────────

function MemberRow({
  email, role, alloc, expanded, onToggle, summary, children,
}: {
  email: string
  role: string
  alloc: Allocation
  expanded: boolean
  onToggle: () => void
  summary: React.ReactNode
  children: React.ReactNode
}) {
  const everything = role === 'sub_admin'
  return (
    <li className="rounded-lg border border-brand-pale-dusk bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-[0.95rem] text-brand-umber">{email}</span>
          <span className="mt-0.5 block font-sans text-[0.7rem] text-brand-slate">{summary}</span>
        </span>
        {everything ? (
          <span className="rounded-full bg-brand-indigo/10 px-2.5 py-0.5 font-sans text-[0.62rem] uppercase tracking-label text-brand-indigo">
            sub-admin · sees everything
          </span>
        ) : (
          <>
            <span className="font-sans text-[0.7rem] tabular-nums text-brand-slate">
              {grantCount(alloc)} {grantCount(alloc) === 1 ? 'grant' : 'grants'}
            </span>
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={`Edit access for ${email}`}
              onClick={onToggle}
              className="rounded-full border border-brand-pale-dusk px-3.5 py-1 font-sans text-[0.7rem] text-brand-slate transition hover:border-brand-indigo hover:text-brand-indigo"
            >
              {expanded ? 'Close' : 'Edit access'}
            </button>
          </>
        )}
      </div>
      {expanded ? <div className="border-t border-brand-pale-dusk/70 px-4 py-4">{children}</div> : null}
    </li>
  )
}

// ── Main section ──────────────────────────────────────────────────────────────

export function AllocationsSection({ adminEmail }: { adminEmail: string }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const members = useMembers(0)
  const allocations = useAllAllocations(refreshKey)
  const lines = useLines()
  const figures = useFigures()
  const comics = useComics()

  const [expanded, setExpanded] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // ── Lookup tables ──
  const lineOptions = useMemo(
    () => (lines.data ?? []).map((l) => ({ slug: l.slug, title: l.title })),
    [lines.data],
  )
  const lineTitle = useMemo(() => {
    const m = new Map(lineOptions.map((l) => [l.slug, l.title]))
    return (slug: string) => m.get(slug) ?? titleCaseSlug(slug)
  }, [lineOptions])

  const programOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of comics.data ?? []) {
      if (c.program_slug) m.set(c.program_slug, c.series || titleCaseSlug(c.program_slug))
    }
    return Array.from(m, ([slug, title]) => ({ slug, title })).sort((a, b) => a.title.localeCompare(b.title))
  }, [comics.data])
  const programTitle = useMemo(() => {
    const m = new Map(programOptions.map((p) => [p.slug, p.title]))
    return (slug: string) => m.get(slug) ?? titleCaseSlug(slug)
  }, [programOptions])

  const figureOptions = useMemo(() => {
    // figure → line, inferred from comics (figure docs carry no line field here).
    const lineOf = new Map<string, string>()
    for (const c of comics.data ?? []) if (c.subject_slug) lineOf.set(c.subject_slug, c.line)
    return (figures.data ?? []).map((f) => ({ slug: f.slug, line: lineOf.get(f.slug) ?? '' }))
  }, [figures.data, comics.data])

  const comicTitle = useMemo(() => {
    const m = new Map((comics.data ?? []).map((c) => [comicId(c), c.title || c.slug]))
    return (id: string) => m.get(id) ?? id
  }, [comics.data])

  const subjectByComic = useMemo<Record<string, string | undefined>>(
    () => Object.fromEntries((comics.data ?? []).map((c) => [comicId(c), c.subject_slug ?? undefined])),
    [comics.data],
  )

  // ── Rows: every allowlist member, plus any allocation doc for an email that
  //    is not on the allowlist (a domain user who signed in directly). ──
  const allocByEmail = useMemo(() => {
    const m = new Map<string, Allocation>()
    for (const a of allocations.data ?? []) m.set(a.email, a)
    return m
  }, [allocations.data])

  const rows = useMemo(() => {
    const memberList: Member[] = members.data ?? []
    const seen = new Set(memberList.map((m) => m.email))
    const extra = (allocations.data ?? []).filter((a) => !seen.has(a.email))
    return [
      ...memberList.map((m) => ({ email: m.email, role: m.role as string })),
      ...extra.map((a) => ({ email: a.email, role: 'domain' })),
    ].sort((a, b) => a.email.localeCompare(b.email))
  }, [members.data, allocations.data])

  // ── Writes ──
  const write = async (email: string, grants: Grants) => {
    setErrMsg(null)
    try {
      await setGrants(email, grants, { adminEmail, subjectByComic })
      setRefreshKey((k) => k + 1)
    } catch {
      setErrMsg('Couldn’t save the change — try again.')
    }
  }

  // Plain-English access summary for a row.
  const summarize = (role: string, a: Allocation): React.ReactNode => {
    if (role === 'sub_admin') return 'Everything, without needing grants'
    const bits: string[] = [
      ...a.lines.map((l) => `${lineTitle(l)} (line)`),
      ...a.programs.map((p) => `${programTitle(p)} (series)`),
      ...a.figures.map((f) => titleCaseSlug(f)),
      ...a.comics.map((c) => comicTitle(c)),
    ]
    if (bits.length === 0)
      return <span className="text-brand-gold">Nothing yet — this person sees no work</span>
    const shown = bits.slice(0, 4)
    return shown.join(' · ') + (bits.length > 4 ? ` · +${bits.length - 4} more` : '')
  }

  const loading = members.loading || allocations.loading

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="font-serif font-light text-brand-umber text-[1.4rem]">Who sees what</h2>
      </div>
      <p className="mb-5 max-w-2xl font-serif text-sm leading-relaxed text-brand-umber/70">
        Members see only the work you grant them, listed here in plain terms. You and the
        sub-admins see everything without grants. To change someone’s access, open{' '}
        <em>Edit access</em> on their row.
      </p>

      {errMsg && (
        <p role="alert" className="mb-4 rounded-md border border-brand-gold/60 bg-brand-gold/10 px-4 py-2 font-sans text-sm text-brand-umber">
          {errMsg}
        </p>
      )}

      {loading ? (
        <p className="font-sans text-sm text-brand-slate">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-brand-pale-dusk px-4 py-6 text-center font-sans text-sm text-brand-slate">
          No members yet — add one under People, then grant them work here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ email, role }) => {
            const alloc = allocByEmail.get(email) ?? EMPTY(email)
            const isOpen = expanded === email
            return (
              <MemberRow
                key={email}
                email={email}
                role={role}
                alloc={alloc}
                expanded={isOpen}
                onToggle={() => setExpanded(isOpen ? null : email)}
                summary={summarize(role, alloc)}
              >
                <div className="flex flex-col gap-4">
                  {grantCount(alloc) > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {alloc.lines.map((slug) => (
                        <GrantChip
                          key={`l-${slug}`}
                          label={lineTitle(slug)}
                          kindLabel="line"
                          removeLabel={`Remove line ${lineTitle(slug)}`}
                          onRemove={() => write(email, removeGrant(alloc, 'line', slug))}
                        />
                      ))}
                      {alloc.programs.map((slug) => (
                        <GrantChip
                          key={`p-${slug}`}
                          label={programTitle(slug)}
                          kindLabel="series"
                          removeLabel={`Remove series ${programTitle(slug)}`}
                          onRemove={() => write(email, removeGrant(alloc, 'program', slug))}
                        />
                      ))}
                      {alloc.figures.map((slug) => (
                        <GrantChip
                          key={`f-${slug}`}
                          label={titleCaseSlug(slug)}
                          kindLabel="figure"
                          removeLabel={`Remove figure ${titleCaseSlug(slug)}`}
                          onRemove={() => write(email, removeGrant(alloc, 'figure', slug))}
                        />
                      ))}
                      {alloc.comics.map((id) => (
                        <GrantChip
                          key={`c-${id}`}
                          label={comicTitle(id)}
                          kindLabel="comic"
                          removeLabel={`Remove comic ${comicTitle(id)}`}
                          onRemove={() => write(email, removeGrant(alloc, 'comic', id))}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="font-sans text-[0.78rem] text-brand-slate">
                      No grants yet — this member sees nothing until you give access below.
                    </p>
                  )}

                  <GrantComposer
                    alloc={alloc}
                    lineOptions={lineOptions}
                    programOptions={programOptions}
                    figureOptions={figureOptions}
                    comicOptions={comics.data ?? []}
                    onGrant={(kind, value) => write(email, addGrant(alloc, kind, value))}
                  />
                </div>
              </MemberRow>
            )
          })}
        </ul>
      )}
    </section>
  )
}

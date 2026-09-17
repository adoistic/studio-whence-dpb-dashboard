'use client'

import { useMemo, useRef, useState } from 'react'
import type { ChangelogEntry, Comic } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'

type Corrections = NonNullable<Comic['corrections']>
type CorrectionItem = Corrections['items'][number]
type CorrectionState = CorrectionItem['state']

interface VersionTimelineProps {
  changelog: ChangelogEntry[]
  version?: number
  artChangelog?: ChangelogEntry[]
  artVersion?: number
  artUpdated?: string
  corrections?: Corrections
}

function normalizeEntry(entry: ChangelogEntry): { date?: string; note: string } {
  return typeof entry === 'string' ? { note: entry } : { date: entry.date, note: entry.note }
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** "2026-09-04" → "4 Sep". Parsed by hand so the day never shifts a timezone. */
function shortDate(iso: string | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const month = MONTHS[Number(m[2]) - 1]
  return month ? `${Number(m[3])} ${month}` : null
}

/** The last entry that carries a date — a changelog can end on an undated note. */
function lastDate(log: ChangelogEntry[] | undefined): string | undefined {
  if (!log) return undefined
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const { date } = normalizeEntry(log[i])
    if (date) return date
  }
  return undefined
}

/**
 * The numbered, newest-first list shared by the Script and Artwork tabs. Both
 * histories are the same shape, so they render the same way — including the
 * tolerance for a bare-string entry, which the toddlers line still emits.
 */
function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  const latestVersion = entries.length
  // Build numbered rows (1-based) then reverse so newest is first.
  const rows = entries
    .map((entry, i) => ({ versionNum: i + 1, ...normalizeEntry(entry) }))
    .reverse()

  return (
    <ul className="flex flex-col gap-3">
      {rows.map(({ versionNum, date, note }) => (
        <li
          key={versionNum}
          className="flex items-baseline gap-3 font-serif text-brand-umber leading-relaxed"
        >
          <span className="shrink-0 tabular-nums text-brand-slate text-sm font-sans">
            v{versionNum}
          </span>
          {date && <span className="shrink-0 tabular-nums text-brand-slate text-sm">{date}</span>}
          <span className="flex-1">{note}</span>
          {versionNum === latestVersion && (
            <span className="font-sans text-[0.66rem] uppercase tracking-label text-brand-gold">
              · current
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

// Unresolved first: a reviewer reading the book wants what is still open, not
// the archive of what has already been fixed.
const STATE_ORDER: CorrectionState[] = ['needs-decision', 'raised-with-diamond', 'applied']

const STATE_LABEL: Record<CorrectionState, string> = {
  'needs-decision': 'Needs decision',
  'raised-with-diamond': 'Raised with Diamond',
  applied: 'Applied',
}

const STATE_PILL: Record<CorrectionState, string> = {
  'needs-decision': 'border-brand-gold text-brand-gold',
  'raised-with-diamond': 'border-brand-slate text-brand-slate',
  applied: 'border-brand-pale-dusk text-brand-slate',
}

function CorrectionsList({ corrections }: { corrections: Corrections }) {
  const { counts } = corrections
  const rows = STATE_ORDER.flatMap((state) =>
    corrections.items.filter((item) => item.state === state),
  )
  const summary = (
    [
      [counts.needsDecision, 'needs decision'],
      [counts.raisedWithDiamond, 'raised with Diamond'],
      [counts.applied, 'applied'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(' · ')

  return (
    <div className="flex flex-col gap-4">
      <p className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
        {corrections.total} {corrections.total === 1 ? 'correction' : 'corrections'}
        {summary && ` — ${summary}`}
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-serif text-brand-umber leading-relaxed"
          >
            {item.page != null && (
              <span className="shrink-0 tabular-nums text-brand-slate text-sm font-sans">
                p. {item.page}
              </span>
            )}
            <span className="min-w-[12rem] flex-1">{item.summary}</span>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-0.5 font-sans text-[0.62rem] uppercase tracking-label ${STATE_PILL[item.state]}`}
            >
              {STATE_LABEL[item.state]}
            </span>
            {item.note && (
              <span className="w-full font-sans text-[0.72rem] text-brand-slate">{item.note}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function VersionTimeline({
  changelog,
  artChangelog,
  artUpdated,
  corrections,
}: VersionTimelineProps) {
  const tabs = useMemo(() => {
    const t: { id: string; label: string; panel: React.ReactNode }[] = []
    if (changelog.length > 0) {
      t.push({ id: 'script', label: 'Script', panel: <ChangelogList entries={changelog} /> })
    }
    if (artChangelog?.length) {
      t.push({ id: 'artwork', label: 'Artwork', panel: <ChangelogList entries={artChangelog} /> })
    }
    if (corrections?.total) {
      t.push({
        id: 'corrections',
        label: 'Corrections',
        panel: <CorrectionsList corrections={corrections} />,
      })
    }
    return t
  }, [changelog, artChangelog, corrections])

  const [activeId, setActiveId] = useState('script')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  if (tabs.length === 0) return null

  // Default to Script; fall back to whatever tab the book actually has.
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    let next: string | null = null
    if (delta !== 0) {
      const i = tabs.findIndex((t) => t.id === active.id)
      next = tabs[(i + delta + tabs.length) % tabs.length].id
    } else if (event.key === 'Home') {
      next = tabs[0].id
    } else if (event.key === 'End') {
      next = tabs[tabs.length - 1].id
    }
    if (!next) return
    event.preventDefault()
    setActiveId(next)
    tabRefs.current[next]?.focus()
  }

  const scriptDate = shortDate(lastDate(changelog))
  const artDate = shortDate(artUpdated ?? lastDate(artChangelog))

  return (
    <section className="flex flex-col gap-6 pt-16">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <SectionHead kicker="History" title="Version history" />
        {(scriptDate || artDate) && (
          <p className="font-sans text-[0.72rem] uppercase tracking-label text-brand-slate">
            {scriptDate && (
              <span>
                Script <span className="tabular-nums text-brand-umber">{scriptDate}</span>
              </span>
            )}
            {scriptDate && artDate && <span aria-hidden> · </span>}
            {artDate && (
              <span>
                Artwork <span className="tabular-nums text-brand-umber">{artDate}</span>
              </span>
            )}
          </p>
        )}
      </header>

      <div role="tablist" aria-label="Version history" className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = tab.id === active.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`version-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`version-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              ref={(el) => {
                tabRefs.current[tab.id] = el
              }}
              onClick={() => setActiveId(tab.id)}
              onKeyDown={onKeyDown}
              className={`rounded-full border px-4 py-1.5 font-sans text-[0.72rem] uppercase tracking-label transition-colors ${
                isActive
                  ? 'border-brand-indigo bg-brand-indigo text-brand-pale-dusk'
                  : 'border-brand-pale-dusk bg-brand-cream text-brand-slate hover:border-brand-gold hover:text-brand-indigo'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`version-panel-${active.id}`}
        aria-labelledby={`version-tab-${active.id}`}
      >
        {active.panel}
      </div>
    </section>
  )
}

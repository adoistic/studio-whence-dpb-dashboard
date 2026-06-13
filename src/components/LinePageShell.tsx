'use client'

import { useState, type ReactNode } from 'react'
import type { Line } from '@/types/content'
import { ComicAnalysisTab } from '@/components/ComicAnalysisTab'
import { ComicsTable } from '@/components/ComicsTable'
import { PeopleTable } from '@/components/PeopleTable'
import { SectionHead } from '@/components/SectionHead'
import { TingalandGallery } from '@/components/TingalandGallery'
import { LINE_VISUALS, TINGALAND_CAST } from '@/lib/images'
import { derivePeople, type PersonRow } from '@/lib/people'
import { useResolved } from '@/lib/useResolved'

interface LinePageShellProps {
  line: Line
  introMdx: ReactNode
  people?: PersonRow[]
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-serif font-light text-brand-indigo text-3xl leading-none">{value}</span>
      <span className="font-sans text-[0.68rem] uppercase tracking-label text-brand-slate">{label}</span>
    </div>
  )
}

export function LinePageShell({ line, introMdx, people }: LinePageShellProps) {
  const visual = LINE_VISUALS[line.slug]
  const seriesCount = new Set(line.comics.map((c) => c.series).filter(Boolean)).size
  const urls = useResolved(visual?.image ? [visual.image] : [])
  const mastheadUrl = visual?.image ? urls[visual.image] : undefined

  // Lines that carry figures get a People-style table; lines without figures keep
  // the comics-in-production table exactly as before.
  const hasFigures = line.figures.length > 0
  const peopleRows = people ?? derivePeople(line.figures, line.comics)

  // medicomics moves its growing Diseases (figure) table and the Medikidz
  // "Comic Analysis" embed behind a tab bar so the analysis is never buried.
  const isMedicomics = line.slug === 'medicomics'
  const [tab, setTab] = useState<'diseases' | 'analysis'>('diseases')

  return (
    <div>
      {/* ── Masthead ───────────────────────────────────────────────────── */}
      <section className="surface-deep grain relative overflow-hidden">
        {mastheadUrl && (
          <img
            src={mastheadUrl}
            alt=""
            aria-hidden
            className="drift pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.16]"
          />
        )}
        <div className="relative mx-auto max-w-[1200px] px-6 py-16 md:py-20">
          <span className="reveal flex items-center gap-3" style={{ ['--i' as string]: 0 }}>
            <span aria-hidden className="block h-px w-7 bg-brand-gold" />
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
              {visual?.note ?? 'Studio Whence'}
            </span>
          </span>
          <h1
            className="reveal mt-6 font-serif font-light leading-[0.98] text-brand-cream text-[2.4rem] md:text-[3.6rem]"
            style={{ ['--i' as string]: 1 }}
          >
            {line.title}
          </h1>
          <p
            className="reveal mt-5 max-w-xl font-serif text-lg leading-relaxed text-brand-pale-dusk/80"
            style={{ ['--i' as string]: 2 }}
          >
            {line.subtitle}
          </p>
        </div>
      </section>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1200px] px-6">
        {/* Lead intro (hand-authored MDX) with editorial drop-cap */}
        <div className="lead max-w-2xl pt-14 font-serif text-lg leading-relaxed text-brand-umber md:pt-16">
          {introMdx}
        </div>

        {/* Stat row */}
        <div className="mt-12 flex flex-wrap gap-x-14 gap-y-8 border-t border-brand-pale-dusk pt-10">
          {hasFigures && <Stat value={line.figures.length} label="figures researched" />}
          <Stat value={line.comics.length} label="comics in production" />
          {seriesCount > 1 && <Stat value={seriesCount} label="series" />}
        </div>

        {/* Tingaland production gallery — shows on the (future) tingaland line, not the
            Diamond Activity Books line that now occupies the `toddlers` slug. */}
        {line.slug === 'tingaland' && TINGALAND_CAST.length > 0 && (
          <section className="flex flex-col gap-8 pt-20">
            <SectionHead kicker="Tingaland" title="The world, drawn" />
            <TingalandGallery />
          </section>
        )}

        {/* Content region.
            - medicomics: a tab bar — "Diseases" (the figure People-table) and
              "Comic Analysis" (the Medikidz embed) — so a growing disease list
              never buries the analysis.
            - any other line WITH figures (e.g. biographies): one People table.
            - lines WITHOUT figures: the comics-in-production table, as before. */}
        {isMedicomics ? (
          <section className="flex flex-col gap-8 pb-24 pt-20">
            {/* Tab bar — pill toggle (same pattern as the comic reader's view tabs). */}
            <div
              role="tablist"
              aria-label="Line view"
              className="inline-flex items-center gap-0.5 self-start rounded-full border border-brand-pale-dusk bg-brand-threshold/70 p-0.5 font-sans"
            >
              {([
                { key: 'diseases', label: 'Diseases' },
                { key: 'analysis', label: 'Comic Analysis' },
              ] as const).map(({ key, label }) => {
                const active = tab === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(key)}
                    className={`rounded-full px-4 py-1.5 font-sans text-[0.72rem] font-semibold uppercase tracking-label transition-colors ${
                      active
                        ? 'bg-brand-indigo text-brand-pale-dusk shadow-sm'
                        : 'text-brand-slate hover:text-brand-indigo'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {tab === 'diseases' ? (
              <PeopleTable people={peopleRows} filename={`${line.slug}-diseases.csv`} />
            ) : (
              <ComicAnalysisTab />
            )}
          </section>
        ) : hasFigures ? (
          <section className="flex flex-col gap-8 pb-24 pt-20">
            <SectionHead kicker="The library" title="People" />
            <PeopleTable people={peopleRows} filename={`${line.slug}-people.csv`} />
          </section>
        ) : (
          <section className="flex flex-col gap-8 pb-24 pt-20">
            <SectionHead kicker="In production" title="Comics in production" />
            <ComicsTable comics={line.comics} filename={`${line.slug}-comics-in-production.csv`} />
          </section>
        )}
      </main>
    </div>
  )
}

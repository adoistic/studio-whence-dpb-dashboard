'use client'

import { useMemo, useState } from 'react'
import type { Comic, Figure, Program } from '@/types/content'
import { ComicsTable } from '@/components/ComicsTable'
import { PeopleTable } from '@/components/PeopleTable'
import { SectionHead } from '@/components/SectionHead'
import { WorkCharacters } from '@/components/WorkCharacters'
import { useCasts } from '@/lib/casts'
import { derivePeople } from '@/lib/people'

type Tab = 'comics' | 'characters' | 'subjects'

// The Program page (Line → Program → Subject), general across every line. A
// masthead + a pill tab bar:
//   Comics      the programme's books (the comic table);
//   Characters  every character those books stage — drawn, not drawn yet and
//               generalised — with their sheets, downloadable one by one, as a
//               selection or all at once (WorkCharacters over the books' casts);
//   Subjects    the research subjects, each linking to its dossier (the People
//               table that used to sit under "Characters").
export function ProgramPageShell({
  program,
  comics,
  figures,
}: {
  program: Program
  comics: Comic[]
  figures: Figure[]
}) {
  const [tab, setTab] = useState<Tab>('comics')
  const peopleRows = derivePeople(figures, comics)

  // The cast of every book the viewer can see in this programme, plus the line's
  // cast library (sheets staged on no page yet). Loaded only once the tab is
  // opened, so the Comics view never pays for it.
  const castIds = useMemo(
    () => (tab === 'characters' ? [...comics.map((c) => `${c.line}__${c.slug}`), `${program.line}__library`] : []),
    [tab, comics, program.line],
  )
  const casts = useCasts(castIds)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'comics', label: 'Comics' },
    { key: 'characters', label: 'Characters' },
    ...(figures.length > 0 ? [{ key: 'subjects' as const, label: 'Subjects' }] : []),
  ]

  return (
    <div>
      {/* ── Masthead ───────────────────────────────────────────────────── */}
      <section className="surface-deep grain relative overflow-hidden">
        <div className="relative mx-auto max-w-[1200px] px-6 py-16 md:py-20">
          <a
            href={`/${program.line}`}
            className="reveal flex items-center gap-3"
            style={{ ['--i' as string]: 0 }}
          >
            <span aria-hidden className="block h-px w-7 bg-brand-gold" />
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
              {program.line}
            </span>
          </a>
          <h1
            className="reveal mt-6 font-serif font-light leading-[0.98] text-brand-cream text-[2.4rem] md:text-[3.6rem]"
            style={{ ['--i' as string]: 1 }}
          >
            {program.title}
          </h1>
          {program.blurb && (
            <p
              className="reveal mt-5 max-w-xl font-serif text-lg leading-relaxed text-brand-pale-dusk/80"
              style={{ ['--i' as string]: 2 }}
            >
              {program.blurb}
            </p>
          )}
        </div>
      </section>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1200px] px-6">
        <section className="flex flex-col gap-8 pb-24 pt-16">
          <div
            role="tablist"
            aria-label="Program view"
            className="inline-flex items-center gap-0.5 self-start rounded-full border border-brand-pale-dusk bg-brand-threshold/70 p-0.5 font-sans"
          >
            {tabs.map(({ key, label }) => {
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

          {tab === 'comics' && (
            <>
              <SectionHead kicker="In production" title="Comics" />
              <ComicsTable comics={comics} filename={`${program.line}-${program.slug}-comics.csv`} />
            </>
          )}
          {tab === 'characters' && (
            <>
              <SectionHead kicker="The cast" title="Characters" />
              <WorkCharacters
                casts={casts.data}
                loading={casts.loading}
                title={program.title}
                program={program.slug}
                showComics
              />
            </>
          )}
          {tab === 'subjects' && (
            <>
              <SectionHead kicker="The library" title="Subjects" />
              <PeopleTable people={peopleRows} filename={`${program.line}-${program.slug}-subjects.csv`} />
            </>
          )}
        </section>
      </main>
    </div>
  )
}

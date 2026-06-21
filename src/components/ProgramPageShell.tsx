'use client'

import { useState } from 'react'
import type { Comic, Figure, Program } from '@/types/content'
import { ComicsTable } from '@/components/ComicsTable'
import { PeopleTable } from '@/components/PeopleTable'
import { SectionHead } from '@/components/SectionHead'
import { derivePeople } from '@/lib/people'

// The Program page (Line → Program → Subject), general across every line. A
// masthead + a pill tab bar (Comics · Characters). Comics tab reuses the comic
// table; Characters tab reuses the People table over the program's cast. The
// Research/Library tab + the per-Subject Design (bible + variation gallery) land
// in Phase B; this is the navigable skeleton.
export function ProgramPageShell({
  program,
  comics,
  figures,
}: {
  program: Program
  comics: Comic[]
  figures: Figure[]
}) {
  const hasChars = figures.length > 0
  const [tab, setTab] = useState<'comics' | 'characters'>('comics')
  const peopleRows = derivePeople(figures, comics)

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
          {hasChars && (
            <div
              role="tablist"
              aria-label="Program view"
              className="inline-flex items-center gap-0.5 self-start rounded-full border border-brand-pale-dusk bg-brand-threshold/70 p-0.5 font-sans"
            >
              {(
                [
                  { key: 'comics', label: 'Comics' },
                  { key: 'characters', label: 'Characters' },
                ] as const
              ).map(({ key, label }) => {
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
          )}

          {!hasChars || tab === 'comics' ? (
            <>
              <SectionHead kicker="In production" title="Comics" />
              <ComicsTable comics={comics} filename={`${program.line}-${program.slug}-comics.csv`} />
            </>
          ) : (
            <>
              <SectionHead kicker="The cast" title="Characters" />
              <PeopleTable people={peopleRows} filename={`${program.line}-${program.slug}-characters.csv`} />
            </>
          )}
        </section>
      </main>
    </div>
  )
}

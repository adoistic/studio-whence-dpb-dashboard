'use client'

/**
 * /characters — every character in the studio, drawn and undrawn.
 *
 * The per-comic cast lives on each comic page (`CharacterGrid`). This is the
 * repo-wide roster: what the art department still owes, in one list, for the
 * surface being browsed.
 *
 * SURFACE SEPARATION is the point of the plumbing here, not a detail. The two
 * surfaces are separate bodies of work — `manga/indic`'s Ram is a different
 * character from Indic's Ram, with a different design and a different book — so
 * a manga character must never turn up in a comics-surface listing or the
 * reverse. It is enforced three times over:
 *
 *   1. `useLines()` is already surface-scoped at the catalog choke point.
 *   2. `rosterLineSlugs` re-derives the slugs from the active surface, so only
 *      that surface's roster docs are ever READ.
 *   3. `selectCharacters` drops any person whose own line resolves elsewhere.
 *
 * Access itself is untouched by any of this — it stays with the allocation and
 * the Firestore rules, exactly as `surface.ts` says.
 */

import { useMemo } from 'react'
import { useLines } from '@/lib/catalog'
import { rosterLineSlugs, useCharacterRosters } from '@/lib/characters'
import { SURFACE_LABEL, useActiveSurface } from '@/lib/surface'
import { CharacterRoster } from '@/components/CharacterRoster'
import { SectionHead } from '@/components/SectionHead'
import { ErrorState, LoadingState } from '@/components/QuietStates'

export default function CharactersPage() {
  const { data: lines, loading: linesLoading } = useLines()
  const { surface } = useActiveSurface()

  const slugs = useMemo(() => rosterLineSlugs(lines, surface), [lines, surface])
  const { data: rosters, loading, error } = useCharacterRosters(slugs)

  const lineTitles = useMemo(() => {
    const map: Record<string, string> = {}
    for (const l of lines ?? []) map[l.slug] = l.title
    return map
  }, [lines])

  return (
    <div>
      <section className="surface-deep grain relative overflow-hidden">
        <div className="relative mx-auto max-w-[1200px] px-6 py-14 md:py-16">
          <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
            {surface ? `${SURFACE_LABEL[surface]} · the cast` : 'The cast'}
          </span>
          <h1 className="mt-4 font-serif font-light leading-[1.0] text-brand-cream text-[2.1rem] md:text-[3rem]">
            Every character
          </h1>
          <p className="mt-5 max-w-2xl font-serif text-lg leading-relaxed text-brand-pale-dusk/80">
            Every character our books stage, and every version each one needs.
            The ones nobody has drawn yet are here too — that is the list the art
            department works from.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-[1200px] px-6 pb-24 pt-14">
        {linesLoading || loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState />
        ) : (rosters?.length ?? 0) === 0 ? (
          <div className="flex flex-col gap-4">
            <SectionHead kicker="Characters" title="No roster published yet" />
            <p className="max-w-xl font-serif text-brand-umber">
              The character roster is built by the production pipeline. Nothing has
              been published for this surface yet.
            </p>
          </div>
        ) : (
          <CharacterRoster rosters={rosters} surface={surface} lineTitles={lineTitles} />
        )}
      </main>
    </div>
  )
}

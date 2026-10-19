'use client'

/**
 * /characters — every character in the studio, drawn, not drawn yet and generalised.
 *
 * The same `WorkCharacters` view every work has, over the casts of every comic the
 * viewer may see on the active surface. A comic page shows its own cast, a programme
 * the union of its books; this is the union of everything — the list the art
 * department works from.
 *
 * SURFACE SEPARATION is kept, not loosened. The two surfaces are separate bodies of
 * work — `manga-indic`'s Rama is a different character from Indic's Rama, with a
 * different design — so a cast is listed only on the surface its comic's line belongs
 * to (`useSurfaceCasts`). Identity is `(line, id)`, so the two Ramas can never merge
 * even if both were in view. Shared IP (Little Chanakya and the Little Chanakya &
 * Friends cast) carries the line `shared` and merges into ONE entry across every book
 * that stages it, which is what keeps Pihu from reading as drawn under one line and
 * owed under another.
 *
 * Access is untouched by any of this: a member only ever receives the casts of the
 * comics they are allocated (the `casts` rule is the comics rule).
 */

import { useMemo } from 'react'
import { useLines } from '@/lib/catalog'
import { useSurfaceCasts } from '@/lib/casts'
import { SURFACE_LABEL, useActiveSurface } from '@/lib/surface'
import { useVisibleComics } from '@/lib/visibleCatalog'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { WorkCharacters } from '@/components/WorkCharacters'

export default function CharactersPage() {
  const { data: lines } = useLines()
  const { surface } = useActiveSurface()
  const { user, loading: authLoading } = useUser()
  const status = useAllowStatus(user, authLoading)
  const canMod = canModerate(status)
  const email = user?.email ?? null
  // A member reads casts by comic id; a moderator lists them all in one query, so
  // their comics scan is skipped (the member path with no email returns at once).
  const visible = useVisibleComics(false, canMod ? null : email)
  const visibleIds = useMemo(
    () => (canMod ? [] : visible.data ? visible.data.map((c) => `${c.line}__${c.slug}`) : null),
    [canMod, visible.data],
  )
  const casts = useSurfaceCasts(canMod, visibleIds, surface)

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
            Every character our books stage, and every version each one needs. The ones
            nobody has drawn yet are here too, and so are the unnamed roles and crowds.
            That is the list the art department works from.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-[1200px] px-6 pb-24 pt-14">
        <WorkCharacters
          casts={casts.data}
          loading={casts.loading || authLoading}
          title="Studio Whence"
          showComics
          showLineFilter
          lineTitles={lineTitles}
          emptyNote="No cast has been published for this surface yet."
        />
      </main>
    </div>
  )
}

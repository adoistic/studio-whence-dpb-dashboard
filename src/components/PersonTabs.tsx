'use client'

import Link from 'next/link'
import { furthestComic, type PersonComic } from '@/lib/people'

const TAB = 'font-sans text-[0.72rem] uppercase tracking-label transition-colors'
const ACTIVE = 'text-brand-indigo border-b-2 border-brand-gold'
const INACTIVE = 'text-brand-slate hover:text-brand-indigo border-b-2 border-transparent'

export function PersonTabs({
  figureSlug, comics, active, activeComicSlug,
}: {
  figureSlug: string | null
  comics: PersonComic[]
  active: 'research' | 'comics'
  activeComicSlug?: string
}) {
  const top = furthestComic(comics)
  return (
    <div className="border-b border-brand-pale-dusk">
      <nav aria-label="Person sections" className="mx-auto flex max-w-[1100px] items-end gap-7 px-6">
        {/* Research tab */}
        {active === 'research' || !figureSlug ? (
          <span className={`${TAB} ${active === 'research' ? ACTIVE : 'text-brand-slate'} py-3`} aria-current={active === 'research' ? 'page' : undefined}>
            Research
          </span>
        ) : (
          <Link href={`/figures/${figureSlug}`} className={`${TAB} ${INACTIVE} py-3`}>Research</Link>
        )}

        {/* Comics tab */}
        {active === 'comics' ? (
          <span className={`${TAB} ${ACTIVE} py-3`} aria-current="page">
            Comics <span className="text-brand-slate">{comics.length}</span>
          </span>
        ) : top ? (
          <Link href={`/${top.line}/${top.slug}`} className={`${TAB} ${INACTIVE} py-3`}>
            Comics <span className="text-brand-slate">{comics.length}</span>
          </Link>
        ) : (
          <span className={`${TAB} py-3 text-brand-pale-dusk/70`}>No comic yet</span>
        )}
      </nav>

      {/* Edition switcher (comic page, when a subject has several variants) */}
      {active === 'comics' && comics.length > 1 && (
        <EditionSwitcher comics={comics} activeComicSlug={activeComicSlug} />
      )}
    </div>
  )
}

/**
 * Switcher for a subject that has several comic variants/editions (e.g. the
 * medicomics Standard + Premium editions). Shows each comic's REAL title as a
 * consistent pill — the active one filled, the others outlined links — under a
 * small "Editions" label so it reads unmistakably as a set of editions.
 */
function EditionSwitcher({
  comics, activeComicSlug,
}: {
  comics: PersonComic[]
  activeComicSlug?: string
}) {
  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">
          Editions
        </span>
        <div role="tablist" aria-label="Comic editions" className="inline-flex flex-wrap gap-1.5">
          {comics.map((c) => {
            const isActive = c.slug === activeComicSlug
            const base = 'rounded-full border px-4 py-1.5 font-serif text-[0.85rem] leading-tight transition-colors'
            return isActive ? (
              <span
                key={c.slug}
                role="tab"
                aria-selected="true"
                aria-current="page"
                className={`${base} border-brand-indigo bg-brand-indigo text-brand-pale-dusk shadow-sm`}
              >
                {c.title}
              </span>
            ) : (
              <Link
                key={c.slug}
                href={`/${c.line}/${c.slug}`}
                role="tab"
                aria-selected="false"
                className={`${base} border-brand-pale-dusk text-brand-slate hover:border-brand-gold hover:text-brand-indigo`}
              >
                {c.title}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

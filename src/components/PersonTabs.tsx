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

      {/* sibling-comic chips (comic page, when several) */}
      {active === 'comics' && comics.length > 1 && (
        <div className="mx-auto flex max-w-[1100px] flex-wrap gap-2 px-6 pb-3">
          {comics.map((c) => {
            const isActive = c.slug === activeComicSlug
            return isActive ? (
              <span key={c.slug} aria-current="page" className="rounded-full border border-brand-gold bg-brand-pale-dusk/60 px-3 py-1 font-serif text-[0.8rem] text-brand-indigo">
                {c.title}
              </span>
            ) : (
              <Link key={c.slug} href={`/${c.line}/${c.slug}`} className="rounded-full border border-brand-pale-dusk px-3 py-1 font-serif text-[0.8rem] text-brand-slate hover:text-brand-indigo">
                {c.title}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

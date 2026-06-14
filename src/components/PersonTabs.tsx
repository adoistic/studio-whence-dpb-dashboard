'use client'

import Link from 'next/link'
import { furthestComic, variantLabels, type PersonComic } from '@/lib/people'

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
 * A clear, labeled segmented control for switching between a subject's comic
 * variants (e.g. the medicomics Standard 24pp / Premium 48pp editions). Each
 * control shows a SHORT distinguishing label — derived by `variantLabels` — not
 * the raw, near-identical long titles. The current variant is highlighted and
 * non-clickable; the others link to their own page.
 */
function EditionSwitcher({
  comics, activeComicSlug,
}: {
  comics: PersonComic[]
  activeComicSlug?: string
}) {
  const labels = variantLabels(comics)
  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">
          {comics.length} editions
        </span>
        <div
          role="tablist"
          aria-label="Comic editions"
          className="inline-flex flex-wrap items-stretch gap-0.5 rounded-full border border-brand-pale-dusk bg-brand-pale-dusk/30 p-0.5"
        >
          {comics.map((c, i) => {
            const { primary, detail } = labels[i]
            const isActive = c.slug === activeComicSlug
            const inner = (
              <span className="flex items-baseline gap-1.5">
                <span className="font-sans text-[0.72rem] font-semibold uppercase tracking-label">
                  {primary}
                </span>
                {detail && (
                  <span className={`font-serif text-[0.78rem] ${isActive ? 'text-brand-pale-dusk/80' : 'text-brand-slate'}`}>
                    {detail}
                  </span>
                )}
              </span>
            )
            return isActive ? (
              <span
                key={c.slug}
                role="tab"
                aria-selected="true"
                aria-current="page"
                className="rounded-full bg-brand-indigo px-4 py-1.5 text-brand-pale-dusk shadow-sm"
              >
                {inner}
              </span>
            ) : (
              <Link
                key={c.slug}
                href={`/${c.line}/${c.slug}`}
                role="tab"
                aria-selected="false"
                className="rounded-full px-4 py-1.5 text-brand-slate transition-colors hover:text-brand-indigo"
              >
                {inner}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

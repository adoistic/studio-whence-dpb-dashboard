'use client'

import Link from 'next/link'
import type { PersonComic } from '@/lib/people'

/**
 * A prominent "editions" band for a comic that ships in several variants (e.g.
 * the medicomics Standard + Premium editions). It lives in the CONTENT BODY as a
 * bordered, tinted card with clear spacing — NOT tucked under the tab strip,
 * where it was easy to miss. Each edition is its REAL title as a pill: the one
 * you're reading is filled, the others link to their own page.
 */
export function ComicEditions({
  comics, activeSlug,
}: {
  comics: PersonComic[]
  activeSlug: string
}) {
  if (comics.length < 2) return null
  return (
    <section
      aria-label="Editions"
      className="mt-10 rounded-xl border border-brand-pale-dusk bg-brand-threshold/70 px-5 py-4 sm:px-6 sm:py-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <span className="font-sans text-[0.66rem] font-semibold uppercase tracking-label text-brand-indigo whitespace-nowrap">
          {comics.length} editions
        </span>
        <div role="tablist" aria-label="Comic editions" className="flex flex-wrap gap-2">
          {comics.map((c) => {
            const isActive = c.slug === activeSlug
            const base = 'rounded-full border px-4 py-2 font-serif text-[0.9rem] leading-tight transition-colors'
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
                className={`${base} border-brand-pale-dusk bg-brand-cream text-brand-slate hover:border-brand-gold hover:text-brand-indigo`}
              >
                {c.title}
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

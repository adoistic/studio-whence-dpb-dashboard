'use client'

import type { Comic, Figure, Program } from '@/types/content'

// A grid of Program cards for a line page (Line → Program → Subject). General
// across every line — biographies' Legends series, Indic's epics, Awareness's
// categories all render through this. Each card links to the Program page.
export function ProgramCards({
  programs,
  comics,
  figures,
  lineSlug,
}: {
  programs: Program[]
  comics: Comic[]
  figures: Figure[]
  lineSlug: string
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {programs.map((p) => {
        const nComics = comics.filter((c) => c.program_slug === p.slug).length
        const nChars = figures.filter((f) => f.program_slug === p.slug).length
        const meta = [
          nComics ? `${nComics} comic${nComics === 1 ? '' : 's'}` : null,
          nChars ? `${nChars} character${nChars === 1 ? '' : 's'}` : null,
          p.status && p.status !== 'active' ? p.status.replace(/-/g, ' ') : null,
        ]
          .filter(Boolean)
          .join('  ·  ')
        return (
          <a
            key={p.slug}
            href={`/programs/${lineSlug}/${p.slug}`}
            className="group flex min-h-[8.5rem] flex-col gap-3 rounded-brand border border-brand-pale-dusk bg-brand-threshold/70 p-6 transition-colors hover:border-brand-gold"
          >
            <h3 className="font-serif text-xl leading-tight text-brand-indigo">{p.title}</h3>
            {p.blurb && (
              <p className="font-serif text-sm leading-relaxed text-brand-umber/90 line-clamp-3">{p.blurb}</p>
            )}
            {meta && (
              <span className="mt-auto font-sans text-[0.64rem] uppercase tracking-label text-brand-slate">
                {meta}
              </span>
            )}
          </a>
        )
      })}
    </div>
  )
}

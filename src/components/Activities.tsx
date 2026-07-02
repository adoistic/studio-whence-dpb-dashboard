'use client'

import type { Comic } from '@/types/content'
import { useResolved } from '@/lib/useResolved'
import { SectionHead } from '@/components/SectionHead'
import { downloadKey } from '@/lib/downloadDoc'

/**
 * "Activity pages" section — the 4-page activity supplement each comic carries
 * (story quiz, words to know, a book-themed activity, draw & color). Image keys
 * come from the gated `activities` catalog block and resolve to short-lived
 * presigned R2 URLs via the same /resolve channel as the reader. Renders
 * nothing if the comic carries no activity pages.
 */
export function Activities({ comic }: { comic: Comic }) {
  const act = comic.activities
  const pages = act?.pages ?? []
  const urls = useResolved(pages.map((p) => p.key))
  if (pages.length === 0) return null

  return (
    <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
      <SectionHead kicker="Supplement" title="Activity pages" />
      <p className="font-serif text-brand-umber leading-relaxed">
        The activity supplement{act?.language ? ` (${act.language})` : ''} — four
        pages bound after the story: a quiz, vocabulary, a themed activity, and a
        drawing page.
      </p>
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {pages.map((p) => (
          <figure key={p.key} className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-cream shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)]">
              {urls[p.key] ? (
                <img
                  src={urls[p.key]}
                  alt={p.label}
                  loading="lazy"
                  className="block w-full"
                />
              ) : (
                <div className="aspect-[3/4] w-full animate-pulse bg-brand-threshold/60" />
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <figcaption className="font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate">
                {p.label}
              </figcaption>
              <button
                type="button"
                aria-label={`Download ${p.label}`}
                onClick={() => downloadKey(p.key, `${comic.slug}-${p.key.split('/').pop()}`)}
                className="shrink-0 rounded-full border border-brand-pale-dusk px-3 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60"
              >
                Download
              </button>
            </div>
          </figure>
        ))}
      </div>
    </section>
  )
}

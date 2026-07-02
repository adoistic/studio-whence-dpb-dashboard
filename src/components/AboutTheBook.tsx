'use client'

import type { Comic } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'

/**
 * "About the Book" section — the sell copy that travels with each title: the
 * printed back-cover pointers (in the book's language) and the buyer-segment
 * pitches (kid / parent / school / retailer / wholesaler / book fair /
 * library) the sales team works from. Pure text from the gated catalog block;
 * renders nothing if the comic carries none.
 */
export function AboutTheBook({ comic }: { comic: Comic }) {
  const ab = comic.aboutTheBook
  if (!ab || (ab.backCover.length === 0 && ab.segments.length === 0)) return null

  return (
    <section className="flex flex-col gap-8 border-t border-brand-pale-dusk pt-16">
      <SectionHead kicker="Positioning" title="About the book" />

      {ab.backCover.length > 0 && (
        <div className="rounded-brand border border-brand-pale-dusk bg-brand-cream p-8 shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)]">
          <h3 className="mb-4 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate">
            Back cover{ab.language ? ` (${ab.language})` : ''}
          </h3>
          <ul className="flex flex-col gap-3">
            {ab.backCover.map((line) => (
              <li
                key={line}
                className="border-l-2 border-brand-gold pl-4 font-serif text-lg leading-relaxed text-brand-indigo"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ab.segments.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ab.segments.map((seg) => (
            <div
              key={seg.audience}
              className="flex flex-col gap-3 rounded-brand border border-brand-pale-dusk bg-white/60 p-6"
            >
              <h4 className="font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate">
                {seg.label}
              </h4>
              <ul className="flex flex-col gap-2">
                {seg.pointers.map((p) => (
                  <li key={p} className="font-serif leading-relaxed text-brand-umber">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

'use client'

import type { Comic } from '@/types/content'
import { useResolved } from '@/lib/useResolved'
import { SectionHead } from '@/components/SectionHead'
import { downloadKey } from '@/lib/downloadDoc'

/**
 * "Cover options" gallery — shows the candidate front-cover designs (3 per comic)
 * for the editorial team to review and choose. Image keys come from the gated
 * `coverOptions` catalog block and are resolved to short-lived presigned R2 URLs
 * via the same /resolve channel as the reader. Renders nothing if the comic
 * carries no cover options.
 */
export function CoverOptions({ comic }: { comic: Comic }) {
  const co = comic.coverOptions
  const options = co?.options ?? []
  const urls = useResolved(options.map((o) => o.key))
  if (options.length === 0) return null

  return (
    <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
      <SectionHead kicker="Covers" title="Cover options" />
      <p className="font-serif text-brand-umber leading-relaxed">
        Candidate front-cover designs{co?.language ? ` (${co.language})` : ''} — review and pick
        the one to take forward.
      </p>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => (
          <figure key={o.key} className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-cream shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)]">
              {urls[o.key] ? (
                <img
                  src={urls[o.key]}
                  alt={`Cover option — ${o.label}`}
                  loading="lazy"
                  className="block w-full"
                />
              ) : (
                <div className="aspect-[3/4] w-full animate-pulse bg-brand-threshold/60" />
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <figcaption className="font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate">
                {o.label}
              </figcaption>
              <button
                type="button"
                aria-label={`Download ${o.label}`}
                onClick={() => downloadKey(o.key, `${comic.slug}-cover-${o.label.toLowerCase().replace(/\s+/g, '-')}.png`)}
                className="rounded-full border border-brand-pale-dusk px-3 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60"
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

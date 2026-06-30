'use client'

import type { Comic } from '@/types/content'
import { useResolved } from '@/lib/useResolved'
import { SectionHead } from '@/components/SectionHead'
import { downloadKey } from '@/lib/downloadDoc'

/**
 * "Inside covers" section — the printed inner-cover pages (inside-front +
 * inside-back). For Hanuman these are the approved exemplars: the "Meet the
 * Characters" cast page and "The World of Hanuman" reader's companion. Image
 * keys come from the gated `insideCovers` catalog block and resolve to
 * short-lived presigned R2 URLs via the same /resolve channel as the reader.
 * Renders nothing if the comic carries no inside covers.
 */
export function InsideCovers({ comic }: { comic: Comic }) {
  const ic = comic.insideCovers
  const images = ic?.images ?? []
  const urls = useResolved(images.map((i) => i.key))
  if (images.length === 0) return null

  return (
    <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
      <SectionHead kicker="Covers" title="Inside covers" />
      <p className="font-serif text-brand-umber leading-relaxed">
        The printed inner-cover pages{ic?.language ? ` (${ic.language})` : ''} — inside-front and
        inside-back. Reference exemplars for the format we carry across the line.
      </p>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        {images.map((i) => (
          <figure key={i.key} className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-cream shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)]">
              {urls[i.key] ? (
                <img
                  src={urls[i.key]}
                  alt={i.label}
                  loading="lazy"
                  className="block w-full"
                />
              ) : (
                <div className="aspect-[3/4] w-full animate-pulse bg-brand-threshold/60" />
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <figcaption className="font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate">
                {i.label}
              </figcaption>
              <button
                type="button"
                aria-label={`Download ${i.label}`}
                onClick={() => downloadKey(i.key, `${comic.slug}-${i.key.split('/').pop()}`)}
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

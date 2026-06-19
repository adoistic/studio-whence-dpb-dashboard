'use client'

import type { Comic } from '@/types/content'
import { useResolved } from '@/lib/useResolved'

/**
 * "A+ Modules" tab body — shows a comic's Amazon A+ marketing modules stacked
 * the way they appear on an Amazon listing (each module is a full-width image,
 * max ~970px). Image keys come from the gated `amazonModules` catalog block and
 * are resolved to short-lived presigned R2 URLs through the same `/resolve`
 * channel the reader and download buttons use (so access is gated to the comic).
 *
 * Renders a graceful empty state if the keys have not yet resolved; renders
 * nothing at all when the comic carries no modules (the parent hides the tab).
 */
export function AmazonModulesPanel({ comic }: { comic: Comic }) {
  const images = comic.amazonModules?.images ?? []
  const urls = useResolved(images.map((m) => m.key))
  if (images.length === 0) return null

  return (
    <div className="flex flex-col items-center gap-10">
      <p className="max-w-[970px] font-serif text-brand-umber leading-relaxed">
        These are the Amazon A+ content modules for this title — the image panels that
        appear on the book&rsquo;s listing page, in order.
      </p>
      {images.map((m) => (
        <figure key={m.key} className="flex w-full max-w-[970px] flex-col gap-2">
          <div className="overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-cream shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)]">
            {urls[m.key] ? (
              <img
                src={urls[m.key]}
                alt={`Amazon module — ${m.label}`}
                loading="lazy"
                className="block w-full"
              />
            ) : (
              <div className="aspect-[970/600] w-full animate-pulse bg-brand-threshold/60" />
            )}
          </div>
          <figcaption className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
            {m.label}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

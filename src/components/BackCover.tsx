'use client'

import type { Comic } from '@/types/content'
import { useResolved } from '@/lib/useResolved'
import { SectionHead } from '@/components/SectionHead'
import { downloadKey } from '@/lib/downloadDoc'

/**
 * "Back cover" section — the About-the-Book blurb composited over the comic's
 * clean cover artwork. One gated image key resolved to a short-lived presigned
 * R2 URL via the same /resolve channel as the reader. Renders nothing if the
 * comic carries no back cover.
 */
export function BackCover({ comic }: { comic: Comic }) {
  const bc = comic.backCover
  const key = bc?.image.key
  const urls = useResolved(key ? [key] : [])
  if (!bc || !key) return null

  return (
    <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
      <SectionHead kicker="Cover" title="Back cover" />
      <p className="font-serif text-brand-umber leading-relaxed">
        The printed back cover{bc.language ? ` (${bc.language})` : ''} — the
        About-the-Book blurb set over the clean artwork. The front cover is held
        blank pending a design rethink.
      </p>
      <figure className="mx-auto flex w-full max-w-sm flex-col gap-3">
        <div className="overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-cream shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)]">
          {urls[key] ? (
            <img src={urls[key]} alt={bc.image.label} loading="lazy" className="block w-full" />
          ) : (
            <div className="aspect-[2/3] w-full animate-pulse bg-brand-threshold/60" />
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <figcaption className="font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate">
            {bc.image.label}
          </figcaption>
          <button
            type="button"
            aria-label={`Download ${bc.image.label}`}
            onClick={() => downloadKey(key, `${comic.slug}-back-cover.png`)}
            className="shrink-0 rounded-full border border-brand-pale-dusk px-3 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60"
          >
            Download
          </button>
        </div>
      </figure>
    </section>
  )
}

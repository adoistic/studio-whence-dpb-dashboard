'use client'

import Link from 'next/link'
import type { Line } from '@/types/content'
import { LINE_VISUALS } from '@/lib/images'
import { useResolved } from '@/lib/useResolved'

interface LineCardProps {
  line: Line
}

export function LineCard({ line }: LineCardProps) {
  const count = line.comics.length
  const visual = LINE_VISUALS[line.slug]
  const seriesCount = new Set(
    line.comics.map((c) => c.series).filter(Boolean)
  ).size
  const urls = useResolved(visual?.image ? [visual.image] : [])
  const bannerUrl = visual?.image ? urls[visual.image] : undefined

  return (
    <Link
      href={`/${line.slug}`}
      aria-label={`View ${line.title}`}
      className="group block overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-threshold no-underline
        transition duration-[400ms] ease-out
        hover:-translate-y-1.5 hover:shadow-[0_40px_70px_-35px_rgba(30,26,58,0.45)]"
    >
      {/* Plate — banner image, or a deep typographic plate for lines without art yet */}
      <div className="relative h-44 overflow-hidden">
        {visual?.image && bannerUrl ? (
          <img
            src={bannerUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
          />
        ) : (
          <div className="surface-deep grain absolute inset-0 flex items-center justify-center">
            <span className="font-serif font-light text-brand-pale-dusk/15 text-[5.5rem] leading-none select-none">
              {line.title.charAt(0)}
            </span>
          </div>
        )}
        {/* Legibility scrim + title */}
        <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/85 via-brand-deep/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <span className="font-sans text-[0.65rem] uppercase tracking-label text-brand-gold">
            {visual?.note}
          </span>
          <h2 className="font-serif font-light text-3xl leading-tight text-brand-cream">
            {line.title}
          </h2>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 p-6">
        <p className="font-serif text-base text-brand-umber leading-relaxed line-clamp-2">
          {line.subtitle}
        </p>

        <div className="flex items-center justify-between border-t border-brand-pale-dusk pt-4">
          <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
            {count} in production
            {seriesCount > 1 && <span className="text-brand-lavender"> · {seriesCount} series</span>}
          </span>

          <span className="font-sans text-xs uppercase tracking-label text-brand-indigo flex items-center gap-1.5">
            View
            <span
              aria-hidden
              className="font-serif text-base inline-block transition-transform duration-[400ms] ease-out group-hover:translate-x-1"
            >
              →
            </span>
          </span>
        </div>
      </div>
    </Link>
  )
}

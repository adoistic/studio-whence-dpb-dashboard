'use client'

import type { Figure } from '@/types/content'
import { useResolved } from '@/lib/useResolved'
import { SectionHead } from '@/components/SectionHead'

// The locked design turnarounds for a Subject (base + life-stage / disguise
// variations). General across lines — Indic characters today, original IP
// characters later. Image keys are gated; resolved to presigned URLs like any
// other gated art.
export function VariationGallery({ variations }: { variations: NonNullable<Figure['variations']> }) {
  const urls = useResolved(variations.map((v) => v.key))
  return (
    <section className="flex flex-col gap-6">
      <SectionHead kicker="Design" title="Turnarounds" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {variations.map((v) => {
          const url = urls[v.key]
          return (
            <figure key={v.stage ?? v.key} className="flex flex-col gap-2">
              <div className="overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-cream">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={v.label} className="h-full w-full object-contain" />
                ) : (
                  <div className="aspect-[16/9] w-full animate-pulse bg-brand-threshold" />
                )}
              </div>
              <figcaption className="font-sans text-[0.66rem] uppercase tracking-label text-brand-slate">
                {v.label}
              </figcaption>
            </figure>
          )
        })}
      </div>
    </section>
  )
}

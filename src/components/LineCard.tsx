import Link from 'next/link'
import type { Line } from '@/types/content'

interface LineCardProps {
  line: Line
}

export function LineCard({ line }: LineCardProps) {
  const count = line.comics.length
  const productionLabel = `${count} in production`

  return (
    <Link
      href={`/${line.slug}`}
      aria-label={`View ${line.title}`}
      className="group block rounded-brand border border-brand-pale-dusk bg-brand-threshold p-8 no-underline
        transition duration-[400ms] ease-out
        hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(30,26,58,0.25)]"
    >
      <div className="flex flex-col gap-4">
        {/* Title */}
        <h2 className="font-serif text-2xl font-light text-brand-indigo leading-snug">
          {line.title}
        </h2>

        {/* Subtitle */}
        <p className="font-serif text-base text-brand-umber leading-relaxed">
          {line.subtitle}
        </p>

        {/* Footer row: count + CTA */}
        <div className="flex items-center justify-between pt-2">
          <span className="font-sans text-xs uppercase tracking-label text-brand-slate">
            {productionLabel}
          </span>

          <span className="font-sans text-sm text-brand-indigo flex items-center gap-1">
            View{' '}
            <span
              aria-hidden
              className="font-serif inline-block transition-transform duration-[400ms] ease-out group-hover:translate-x-1"
            >
              →
            </span>
          </span>
        </div>
      </div>
    </Link>
  )
}

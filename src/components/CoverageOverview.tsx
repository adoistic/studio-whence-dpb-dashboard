'use client'

import Link from 'next/link'
import type { Coverage, CoverageLine, CoveragePipeline } from '@/types/content'

// ── Coverage overview ────────────────────────────────────────────────────────
// The home-page studio-status centerpiece, grounded entirely in meta/coverage.
// One card per line (pre-sorted by the pipeline): figures researched + the
// program/series breakdown + a segmented comic-production pipeline by status.
// Lines with zero figures (Activity Books, Legacy, Tingaland) show just the
// pipeline. Each card links through to /line/<slug>.

// The four production statuses, in pipeline order. Colours stay within the
// brand palette and match StatusPill's existing dots (slate → lavender → gold →
// indigo) so the page reads as one cohesive system rather than a stoplight.
const STATUS_ORDER = ['draft', 'in_review', 'approved', 'published'] as const
type StatusKey = (typeof STATUS_ORDER)[number]

const STATUS_META: Record<StatusKey, { label: string; bar: string; dot: string }> = {
  draft:     { label: 'Draft',     bar: 'bg-brand-slate',    dot: 'bg-brand-slate' },
  in_review: { label: 'In review', bar: 'bg-brand-lavender', dot: 'bg-brand-lavender' },
  approved:  { label: 'Approved',  bar: 'bg-brand-gold',     dot: 'bg-brand-gold' },
  published: { label: 'Published', bar: 'bg-brand-indigo',   dot: 'bg-brand-indigo' },
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

// A short, shared key — rendered once above the grid.
function PipelineLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {STATUS_ORDER.map((k) => (
        <li key={k} className="flex items-center gap-2">
          <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${STATUS_META[k].dot}`} />
          <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">
            {STATUS_META[k].label}
          </span>
        </li>
      ))}
    </ul>
  )
}

// The segmented production bar for a line, by status, with a written breakdown
// beneath it. Renders an empty hairline track when a line has no comics yet.
function PipelineBar({ comics }: { comics: CoveragePipeline }) {
  const total = comics.total
  const present = STATUS_ORDER.filter((k) => comics[k] > 0)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-brand-pale-dusk">
        {total > 0 &&
          present.map((k) => (
            <span
              key={k}
              className={STATUS_META[k].bar}
              style={{ width: `${(comics[k] / total) * 100}%` }}
              title={`${STATUS_META[k].label}: ${fmt(comics[k])}`}
            />
          ))}
      </div>
      {total > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          {present.map((k) => (
            <span key={k} className="flex items-center gap-1.5 font-sans text-[0.7rem] text-brand-slate">
              <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_META[k].dot}`} />
              <span className="font-semibold text-brand-indigo">{fmt(comics[k])}</span>
              {STATUS_META[k].label.toLowerCase()}
            </span>
          ))}
        </div>
      ) : (
        <span className="font-sans text-[0.7rem] italic text-brand-slate">No comics in production yet.</span>
      )}
    </div>
  )
}

// One line's row: identity, figures-researched, program breakdown, pipeline.
function LineRow({ line }: { line: CoverageLine }) {
  const hasFigures = line.figures > 0
  const hasPrograms = line.programs.length > 0

  return (
    <Link
      href={`/${line.slug}`}
      aria-label={`View ${line.title}`}
      className="group block rounded-brand border border-brand-pale-dusk bg-brand-threshold/70 p-6 no-underline
        transition duration-300 ease-out hover:-translate-y-0.5 hover:border-brand-gold
        hover:shadow-[0_30px_55px_-40px_rgba(30,26,58,0.5)] md:p-7"
    >
      {/* Header: line identity (left) + figures-researched stat (right) */}
      <div className="flex items-start justify-between gap-5">
        <div className="flex flex-col gap-1.5">
          <h3 className="font-serif font-light text-2xl leading-tight text-brand-indigo md:text-[1.7rem]">
            {line.title}
          </h3>
          <p className="max-w-md font-serif text-sm leading-snug text-brand-umber/90 line-clamp-2">
            {line.subtitle}
          </p>
        </div>

        {hasFigures && (
          <div className="flex shrink-0 flex-col items-end text-right">
            <span className="font-serif font-light leading-[0.85] text-brand-indigo text-[2.6rem] md:text-[3rem]">
              {fmt(line.figures)}
            </span>
            <span className="mt-1 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
              figures researched
            </span>
          </div>
        )}
      </div>

      {/* Program / series breakdown — figure counts per program, as chips */}
      {hasFigures && hasPrograms && (
        <div className="mt-5 flex flex-wrap gap-2">
          {line.programs
            .filter((p) => p.figures > 0)
            .map((p) => (
              <span
                key={p.slug}
                className="inline-flex items-baseline gap-1.5 rounded-full border border-brand-pale-dusk
                  bg-brand-cream px-2.5 py-1 font-sans text-[0.7rem] text-brand-umber"
              >
                <span className="truncate max-w-[12rem]">{p.title}</span>
                <span className="font-semibold text-brand-indigo">{fmt(p.figures)}</span>
              </span>
            ))}
        </div>
      )}

      {/* Comic-production pipeline */}
      <div className="mt-6 flex flex-col gap-2.5 border-t border-brand-pale-dusk pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-lavender">
            Comic production
          </span>
          <span className="font-sans text-[0.7rem] text-brand-slate">
            <span className="font-semibold text-brand-indigo">{fmt(line.comics.total)}</span>{' '}
            {line.comics.total === 1 ? 'comic' : 'comics'}
          </span>
        </div>
        <PipelineBar comics={line.comics} />
      </div>

      {/* Footer affordance */}
      <div className="mt-5 flex items-center justify-end">
        <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-indigo flex items-center gap-1.5">
          View line
          <span
            aria-hidden
            className="font-serif text-base inline-block transition-transform duration-300 ease-out group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      </div>
    </Link>
  )
}

export function CoverageOverview({ coverage }: { coverage: Coverage }) {
  const { totals, lines } = coverage

  return (
    <div className="flex flex-col gap-7">
      {/* A one-line roll-up + the shared status key */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl font-serif text-brand-umber leading-relaxed">
          <span className="font-medium text-brand-indigo">{fmt(totals.figures)}</span> figures researched and{' '}
          <span className="font-medium text-brand-indigo">{fmt(totals.comics)}</span> comics in production across{' '}
          <span className="font-medium text-brand-indigo">{fmt(totals.lines)}</span> lines — by stage, line by line.
        </p>
        <PipelineLegend />
      </div>

      {/* One card per line, in the pipeline's order */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {lines.map((line, i) => (
          <div key={line.slug} className="reveal" style={{ ['--i' as string]: Math.min(i, 6) }}>
            <LineRow line={line} />
          </div>
        ))}
      </div>
    </div>
  )
}

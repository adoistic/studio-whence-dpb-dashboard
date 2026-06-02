'use client'

import type { ReactNode } from 'react'
import type { Line } from '@/types/content'
import { ComicsTable } from '@/components/ComicsTable'
import { FiguresTable } from '@/components/FiguresTable'
import { SectionHead } from '@/components/SectionHead'
import { TingalandGallery } from '@/components/TingalandGallery'
import { LINE_VISUALS, TINGALAND_CAST } from '@/lib/images'
import { useResolved } from '@/lib/useResolved'

interface LinePageShellProps {
  line: Line
  introMdx: ReactNode
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-serif font-light text-brand-indigo text-3xl leading-none">{value}</span>
      <span className="font-sans text-[0.68rem] uppercase tracking-label text-brand-slate">{label}</span>
    </div>
  )
}

export function LinePageShell({ line, introMdx }: LinePageShellProps) {
  const visual = LINE_VISUALS[line.slug]
  const seriesCount = new Set(line.comics.map((c) => c.series).filter(Boolean)).size
  const urls = useResolved(visual?.image ? [visual.image] : [])
  const mastheadUrl = visual?.image ? urls[visual.image] : undefined

  return (
    <div>
      {/* ── Masthead ───────────────────────────────────────────────────── */}
      <section className="surface-deep grain relative overflow-hidden">
        {mastheadUrl && (
          <img
            src={mastheadUrl}
            alt=""
            aria-hidden
            className="drift pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.16]"
          />
        )}
        <div className="relative mx-auto max-w-[1200px] px-6 py-16 md:py-20">
          <span className="reveal flex items-center gap-3" style={{ ['--i' as string]: 0 }}>
            <span aria-hidden className="block h-px w-7 bg-brand-gold" />
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
              {visual?.note ?? 'Studio Whence'}
            </span>
          </span>
          <h1
            className="reveal mt-6 font-serif font-light leading-[0.98] text-brand-cream text-[2.4rem] md:text-[3.6rem]"
            style={{ ['--i' as string]: 1 }}
          >
            {line.title}
          </h1>
          <p
            className="reveal mt-5 max-w-xl font-serif text-lg leading-relaxed text-brand-pale-dusk/80"
            style={{ ['--i' as string]: 2 }}
          >
            {line.subtitle}
          </p>
        </div>
      </section>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1200px] px-6">
        {/* Lead intro (hand-authored MDX) with editorial drop-cap */}
        <div className="lead max-w-2xl pt-14 font-serif text-lg leading-relaxed text-brand-umber md:pt-16">
          {introMdx}
        </div>

        {/* Stat row */}
        <div className="mt-12 flex flex-wrap gap-x-14 gap-y-8 border-t border-brand-pale-dusk pt-10">
          {line.slug === 'biographies' && line.figures.length > 0 && (
            <Stat value={line.figures.length} label="figures researched" />
          )}
          <Stat value={line.comics.length} label="comics in production" />
          {seriesCount > 1 && <Stat value={seriesCount} label="series" />}
        </div>

        {/* Toddlers: the Tingaland production gallery (hidden until gated image channel lands) */}
        {line.slug === 'toddlers' && TINGALAND_CAST.length > 0 && (
          <section className="flex flex-col gap-8 pt-20">
            <SectionHead kicker="Tingaland" title="The world, drawn" />
            <TingalandGallery />
          </section>
        )}

        {/* Figures researched (biographies only) */}
        {line.slug === 'biographies' && line.figures.length > 0 && (
          <section className="flex flex-col gap-8 pt-20">
            <SectionHead kicker="The library" title="Figures researched" />
            <FiguresTable figures={line.figures} filename={`${line.slug}-figures.csv`} />
          </section>
        )}

        {/* Comics in production */}
        <section className="flex flex-col gap-8 pb-24 pt-20">
          <SectionHead kicker="In production" title="Comics in production" />
          <ComicsTable
            comics={line.comics}
            filename={`${line.slug}-comics-in-production.csv`}
          />
        </section>

        {/* TODO Chunk 5: handoff download (R2 + Worker) */}
      </main>
    </div>
  )
}

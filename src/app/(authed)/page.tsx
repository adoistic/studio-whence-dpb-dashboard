'use client'

import { ActivityFeed } from '@/components/ActivityFeed'
import { CoverageOverview } from '@/components/CoverageOverview'
import { KpiStrip } from '@/components/KpiStrip'
import type { Kpi } from '@/components/KpiStrip'
import { SampleStrip } from '@/components/SampleStrip'
import { SectionHead } from '@/components/SectionHead'
import { StatusWorkbookButton } from '@/components/StatusWorkbookButton'
import { useCoverage, useHeadline, useLines } from '@/lib/catalog'
import { filterCoverageBySurface, surfaceIndex, useActiveSurface } from '@/lib/surface'
import { MangaBackdrop } from '@/components/MangaBackdrop'
import { useResolved } from '@/lib/useResolved'
import { HERO_BACKDROP, SAMPLE_PAGES } from '@/lib/images'
import type { ActivityEntry } from '@/types/content'

// "words on file" is a known library figure — ~10 million words across ~70 books
// and ~224 transcripts. The build script will supply this dynamically later.
const WORDS_ON_FILE = 10_000_000

export default function Home() {
  const { data: meta } = useHeadline()
  const { data: allLines } = useLines()
  // The studio-status roll-up (meta/coverage) drives the coverage overview and
  // supplies the corrected headline counts (figures, comics, lines).
  const { data: fullCoverage } = useCoverage()

  // Everything below is scoped to the surface being browsed, counts included —
  // an unfiltered total beside a filtered line list reads as a miscount.
  const { surface } = useActiveSurface()
  const resolveSurface = surfaceIndex(allLines)
  const lines = allLines?.filter((l) => !surface || resolveSurface(l.slug) === surface) ?? null
  const coverage = fullCoverage ? filterCoverageBySurface(fullCoverage, surface, resolveSurface) : null
  const isManga = surface === 'manga'

  // Resolve the hero backdrop key to a presigned URL; render the <img> only
  // once it's present (degrades cleanly mid-load).
  const heroUrls = useResolved(HERO_BACKDROP ? [HERO_BACKDROP] : [])
  const heroUrl = heroUrls[HERO_BACKDROP]

  // Each catalog hook returns null while its Firestore read loads; the
  // data-dependent sections (KPIs, coverage, activity) render only when their
  // data is present. The KPI counts prefer meta/coverage's totals (the
  // corrected figures/comics/lines) and fall back to the legacy headline.
  const kpis: Kpi[] | null = (coverage || meta)
    ? [
        { label: 'figures researched', value: coverage?.totals.figures ?? meta!.headline.figures_researched },
        { label: 'comics in production', value: coverage?.totals.comics ?? meta!.headline.comics_in_production },
        { label: 'words on file', value: WORDS_ON_FILE, formatter: 'million' },
        { label: 'lines active', value: coverage?.totals.lines ?? meta!.headline.lines_active },
      ]
    : null

  return (
    <div>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section
        className={`relative overflow-hidden ${isManga ? 'surface-manga' : 'surface-deep grain'}`}
      >
        {/* The comics hero is a photographic backdrop; the manga surface gets ink
            and screentone instead, so the two never read as the same page. */}
        {isManga ? (
          <MangaBackdrop />
        ) : (
          heroUrl && (
            <img
              src={heroUrl}
              alt=""
              aria-hidden
              className="drift pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.18]"
            />
          )
        )}
        <div className="relative mx-auto max-w-[1200px] px-6 pb-16 pt-16 md:pb-20 md:pt-24">
          <span className="reveal flex items-center gap-3" style={{ ['--i' as string]: 0 }}>
            <span aria-hidden className={`block w-7 ${isManga ? 'h-0.5 bg-brand-ink' : 'h-px bg-brand-gold'}`} />
            <span
              className={`font-sans text-[0.7rem] uppercase tracking-label ${
                isManga ? 'manga-kicker text-brand-ink' : 'text-brand-gold'
              }`}
            >
              {isManga ? 'Manga · Diamond Toons' : 'Studio status · Diamond Pocket Books'}
            </span>
          </span>

          <h1
            className={`reveal mt-7 max-w-3xl font-serif font-light leading-[0.98] text-[2.6rem] md:text-[4.2rem] ${
              isManga ? 'text-brand-ink' : 'text-brand-cream'
            }`}
            style={{ ['--i' as string]: 1 }}
          >
            {isManga ? (
              <>Told in <em className="font-medium italic">panels.</em></>
            ) : (
              <>Stories in <em className="italic font-medium text-brand-gold">becoming.</em></>
            )}
          </h1>

          <p
            className={`reveal mt-6 max-w-xl font-serif text-lg leading-relaxed ${
              isManga ? 'text-brand-umber' : 'text-brand-pale-dusk/80'
            }`}
            style={{ ['--i' as string]: 2 }}
          >
            {isManga
              ? 'India’s stories in manga grammar — long-form, in volumes, at manga pacing.'
              : `The live state of every comic Studio Whence is building for Diamond Toons${lines ? `, across ${lines.length} lines` : ''}, page by page.`}
          </p>

          {kpis && (
            <div className={`mt-14 pt-10 ${isManga ? 'manga-rule' : 'border-t border-white/10'}`}>
              <KpiStrip kpis={kpis} tone={isManga ? 'light' : 'dark'} />
            </div>
          )}
        </div>
      </section>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1200px] px-6">
        {/* Coverage overview — the studio-status centerpiece (meta/coverage):
            per-line figures researched, program breakdown, and the comic
            pipeline by status. */}
        {coverage && (
          <section className="flex flex-col gap-8 pt-16 md:pt-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHead kicker="Coverage" title="Where every line stands" />
              {/* The whole status as a workbook, built live in the browser from
                  the same gated reads the rest of the app uses. */}
              <StatusWorkbookButton />
            </div>
            <CoverageOverview coverage={coverage} />
          </section>
        )}

        {/* What we make — finished sample pages */}
        {!isManga && SAMPLE_PAGES.length > 0 && (
          <section className="flex flex-col gap-8 pt-20 md:pt-28">
            <SectionHead kicker="On the page" title="What we make" />
            <p className="-mt-2 max-w-xl font-serif text-brand-umber leading-relaxed">
              Finished pages from <em className="italic">Tingaland Rhymes</em>, the
              first Diamond Junior storybook — drawn, lettered, and ready for review.
            </p>
            <SampleStrip />
          </section>
        )}

        {/* What's new */}
        {meta && (
          <section className="flex flex-col gap-8 pb-24 pt-20 md:pt-28">
            <SectionHead kicker="What's new" title="Latest from the studio" />
            <ActivityFeed entries={meta.activity as ActivityEntry[]} />
          </section>
        )}
      </main>
    </div>
  )
}

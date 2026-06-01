import { ActivityFeed } from '@/components/ActivityFeed'
import { KpiStrip } from '@/components/KpiStrip'
import type { Kpi } from '@/components/KpiStrip'
import { LineCard } from '@/components/LineCard'
import { SampleStrip } from '@/components/SampleStrip'
import { SectionHead } from '@/components/SectionHead'
import { loadContent } from '@/lib/content'
import { HERO_BACKDROP, SAMPLE_PAGES, imgUrl } from '@/lib/images'

// "words on file" is a known library figure — ~10 million words across ~70 books
// and ~224 transcripts. The build script will supply this dynamically later.
const WORDS_ON_FILE = 10_000_000

export default function Home() {
  const content = loadContent()
  const { figures_researched, comics_in_production, lines_active } = content.headline

  const kpis: Kpi[] = [
    { label: 'figures researched', value: figures_researched },
    { label: 'comics in production', value: comics_in_production },
    { label: 'words on file', value: WORDS_ON_FILE, formatter: 'million' },
    { label: 'lines active', value: lines_active },
  ]

  return (
    <div>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="surface-deep grain relative overflow-hidden">
        {HERO_BACKDROP && (
          <img
            src={imgUrl(HERO_BACKDROP)}
            alt=""
            aria-hidden
            className="drift pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.18]"
          />
        )}
        <div className="relative mx-auto max-w-[1200px] px-6 pb-16 pt-16 md:pb-20 md:pt-24">
          <span className="reveal flex items-center gap-3" style={{ ['--i' as string]: 0 }}>
            <span aria-hidden className="block h-px w-7 bg-brand-gold" />
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
              Studio status · Diamond Pocket Books
            </span>
          </span>

          <h1
            className="reveal mt-7 max-w-3xl font-serif font-light leading-[0.98] text-brand-cream text-[2.6rem] md:text-[4.2rem]"
            style={{ ['--i' as string]: 1 }}
          >
            Stories in <em className="italic font-medium text-brand-gold">becoming.</em>
          </h1>

          <p
            className="reveal mt-6 max-w-xl font-serif text-lg leading-relaxed text-brand-pale-dusk/80"
            style={{ ['--i' as string]: 2 }}
          >
            The live state of every comic Studio Whence is building for Diamond
            Toons — four lines, page by page.
          </p>

          <div className="mt-14 border-t border-white/10 pt-10">
            <KpiStrip kpis={kpis} tone="dark" />
          </div>
        </div>
      </section>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1200px] px-6">
        {/* The four lines */}
        <section className="flex flex-col gap-8 pt-16 md:pt-20">
          <SectionHead kicker="The lines" title="Four lines in production" />
          <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
            {content.lines.map((line) => (
              <LineCard key={line.slug} line={line} />
            ))}
          </div>
        </section>

        {/* What we make — finished sample pages (hidden until the gated image channel lands) */}
        {SAMPLE_PAGES.length > 0 && (
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
        <section className="flex flex-col gap-8 pb-24 pt-20 md:pt-28">
          <SectionHead kicker="What's new" title="Latest from the studio" />
          <ActivityFeed entries={content.activity} />
        </section>
      </main>
    </div>
  )
}

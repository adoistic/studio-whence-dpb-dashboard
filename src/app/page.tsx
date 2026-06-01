import { Eyebrow } from '@/components/Eyebrow'
import { Footer } from '@/components/Footer'
import { KpiStrip } from '@/components/KpiStrip'
import type { Kpi } from '@/components/KpiStrip'
import { loadContent } from '@/lib/content'

// "words on file" is a known library figure — 10 million words across ~70 books
// and ~224 transcripts. The build script will supply this dynamically in a future
// iteration; for now it is hardcoded as a library constant.
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
    <>
      <main className="max-w-[1200px] mx-auto px-6 py-20 flex flex-col gap-12">
        <Eyebrow>Studio status</Eyebrow>

        <h1 className="text-5xl font-serif font-light text-brand-indigo max-w-lg">
          The studio, page by page.
        </h1>

        <KpiStrip kpis={kpis} />

        {/* TODO Task 3.2: ActivityFeed — recent commits / status changes */}

        {/* TODO Task 3.3: LineCards — one card per active line (biographies, indic, awareness, toddlers) */}
      </main>

      <Footer
        sha={content.source_sha}
        lastUpdate={content.generated_at}
      />
    </>
  )
}

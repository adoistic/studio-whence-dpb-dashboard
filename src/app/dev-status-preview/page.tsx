'use client'

/**
 * DEV-ONLY visual harness for the production dashboard.
 *
 * The real /status sits behind Google sign-in, which makes visual QA of layout
 * changes impossible without a session. This route renders the same component
 * with OBVIOUSLY FAKE fixture data (no real titles, no real counts — this repo
 * is public and carries code only). In a production build it renders nothing.
 */

import { ProductionDashboard } from '@/components/ProductionDashboard'
import type { Comic, Line, Program } from '@/types/content'

const fake = (i: number, over: Partial<Comic>): Comic =>
  ({
    title: `Sample Book ${i}`,
    line: 'alpha',
    slug: `sample-${i}`,
    subject_slug: `subject-${i % 4}`,
    status: (['draft', 'in-review', 'approved', 'published'] as const)[i % 4],
    target_length_pages: 48,
    created: `2026-0${(i % 6) + 1}-10`,
    updated: `2026-0${(i % 6) + 2}-15`,
    pages: { hasPages: true, count: (i * 7) % 49, coverKey: i % 3 === 0 ? 'cover.jpg' : null },
    ...(i % 4 === 0
      ? {
          insideCovers: { images: [{ key: 'a' }, { key: 'b' }] },
          backCover: { image: { key: 'bc' } },
          activities: { pages: [{ key: 'x' }, { key: 'y' }, { key: 'z' }] },
        }
      : {}),
    ...over,
  }) as Comic

const COMICS: Comic[] = [
  ...Array.from({ length: 9 }, (_, i) => fake(i + 1, { program_slug: i % 2 ? 'first-series' : 'second-series' })),
  ...Array.from({ length: 5 }, (_, i) => fake(i + 10, { line: 'beta', program_slug: null })),
  ...Array.from({ length: 3 }, (_, i) => fake(i + 15, { line: 'gamma', program_slug: null, target_length_pages: 64 })),
]

const LINES = [
  { slug: 'alpha', title: 'Alpha Line', subtitle: '', comics: [], figures: [] },
  { slug: 'beta', title: 'Beta Line', subtitle: '', comics: [], figures: [] },
  { slug: 'gamma', title: 'Gamma Line', subtitle: '', comics: [], figures: [] },
] as unknown as Line[]

const PROGRAMS = [
  { slug: 'first-series', line: 'alpha', title: 'First Series' },
  { slug: 'second-series', line: 'alpha', title: 'Second Series' },
] as Program[]

const PRICING = {
  currency: 'INR',
  defaultRatePerPage: 250,
  lines: { alpha: 250, beta: 300, gamma: 250 },
  comics: { 'alpha__sample-3': 400 },
  updatedAt: '2026-08-03T00:00:00Z',
}

export default function DevStatusPreview() {
  if (process.env.NODE_ENV === 'production') {
    return <main className="p-10 font-sans text-sm">Not available.</main>
  }
  return (
    <ProductionDashboard comics={COMICS} lines={LINES} programs={PROGRAMS} pricing={PRICING} canAdmin />
  )
}

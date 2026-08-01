/**
 * Tests for src/app/(authed)/page.tsx (Home).
 *
 * Home is a studio-status / coverage page. Its centerpiece is CoverageOverview,
 * fed by the meta/coverage roll-up (useCoverage). These tests pin that the
 * coverage section renders once the doc loads, and that the KPI strip prefers
 * the coverage totals. The hero/sample/activity sections are out of scope
 * (their data hooks are stubbed minimally).
 *
 * CoverageOverview + KpiStrip are stubbed so "did the section render / with what
 * counts" is directly assertable without dragging in image resolution.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Coverage } from '@/types/content'
import type { Async } from '@/lib/catalog'
import type { Kpi } from '@/components/KpiStrip'
import Home from '../page'

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUseCoverage: () => Async<Coverage>

vi.mock('@/lib/catalog', () => ({
  useHeadline: () => ({ data: null, loading: false }),
  useLines: () => ({ data: [], loading: false }),
  useCoverage: () => mockUseCoverage(),
}))
vi.mock('@/lib/useResolved', () => ({ useResolved: () => ({}) }))
vi.mock('@/lib/images', () => ({ HERO_BACKDROP: null, SAMPLE_PAGES: [] }))

// Stub the heavy visual children. CoverageOverview emits a marker + the line
// titles it received; KpiStrip emits its first KPI value so we can pin counts.
vi.mock('@/components/CoverageOverview', () => ({
  CoverageOverview: ({ coverage }: { coverage: Coverage }) => (
    <div>coverage:{coverage.lines.map((l) => l.title).join(',')}</div>
  ),
}))
vi.mock('@/components/KpiStrip', () => ({
  KpiStrip: ({ kpis }: { kpis: Kpi[] }) => <div>kpi-figures:{kpis[0]?.value}</div>,
}))
vi.mock('@/components/ActivityFeed', () => ({ ActivityFeed: () => null }))
vi.mock('@/components/SampleStrip', () => ({ SampleStrip: () => null }))
vi.mock('@/components/SectionHead', () => ({ SectionHead: () => null }))
// The Excel export button reads the gated catalog through the auth stack; stub
// it like the other heavy children so Home stays testable without Firebase.
vi.mock('@/components/StatusWorkbookButton', () => ({
  StatusWorkbookButton: () => <div>status-workbook-button</div>,
}))

// ─── Fixtures ───────────────────────────────────────────────────────────────

const coverageDoc = {
  generated_at: '2026-06-22',
  source_sha: 'abc123',
  totals: { lines: 7, figures: 276, comics: 69, published: 4, approved: 2, in_review: 23, draft: 40 },
  lines: [
    {
      slug: 'indic',
      title: 'Indic',
      subtitle: 'The epics and the sacred texts',
      figures: 203,
      programs: [{ slug: 'sikhism', title: 'Sikhism', figures: 86, comics: 0 }],
      comics: { total: 0, draft: 0, in_review: 0, approved: 0, published: 0 },
    },
    {
      slug: 'biographies',
      title: 'Biographies',
      subtitle: 'Retold by Little Chanakya',
      figures: 61,
      programs: [{ slug: '01-business-legends', title: 'Business Legends', figures: 13, comics: 5 }],
      comics: { total: 20, draft: 12, in_review: 6, approved: 1, published: 1 },
    },
  ],
} as unknown as Coverage

const loaded = <T,>(data: T): Async<T> => ({ data, loading: false })

beforeEach(() => {
  mockUseCoverage = () => loaded(coverageDoc)
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Home — coverage overview', () => {
  test('renders the coverage overview, fed every line from meta/coverage', () => {
    render(<Home />)
    expect(screen.getByText('coverage:Indic,Biographies')).toBeInTheDocument()
  })

  test('the KPI strip uses the coverage totals (corrected figures count)', () => {
    render(<Home />)
    expect(screen.getByText('kpi-figures:276')).toBeInTheDocument()
  })

  test('without the coverage doc the overview is omitted (no crash)', () => {
    mockUseCoverage = () => ({ data: null, loading: false })
    render(<Home />)
    expect(screen.queryByText(/^coverage:/)).not.toBeInTheDocument()
  })

  test('the Excel export sits with the coverage section', () => {
    render(<Home />)
    expect(screen.getByText('status-workbook-button')).toBeInTheDocument()
  })

  test('and is absent with the section it belongs to', () => {
    mockUseCoverage = () => ({ data: null, loading: false })
    render(<Home />)
    expect(screen.queryByText('status-workbook-button')).not.toBeInTheDocument()
  })
})

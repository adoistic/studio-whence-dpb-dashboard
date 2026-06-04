/**
 * Tests for src/app/(authed)/page.tsx (Home).
 *
 * Home's line grid is allocation-aware: a MODERATOR sees a LineCard for every
 * line, while a MEMBER sees a card only for lines that have ≥1 visible comic in
 * their gated catalog. These tests pin that gating; the hero/KPI/sample/activity
 * sections are out of scope (their data hooks are stubbed minimally).
 *
 * LineCard is stubbed to emit just the line title so "which lines render" is
 * directly assertable without dragging in image resolution.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Line, Comic } from '@/types/content'
import type { Async } from '@/lib/catalog'
import Home from '../page'

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUseLines: () => Async<Line[]>
let mockUseVisibleComics: () => Async<Comic[]>
let mockUseUser: () => { user: { email: string } | null; loading: boolean }
let mockStatus: string

vi.mock('@/lib/catalog', () => ({
  useHeadline: () => ({ data: null, loading: false }),
  useLines: () => mockUseLines(),
}))
vi.mock('@/lib/visibleCatalog', () => ({
  useVisibleComics: () => mockUseVisibleComics(),
}))
vi.mock('@/lib/auth', () => ({
  useUser: () => mockUseUser(),
  useAllowStatus: () => mockStatus,
  canModerate: (s: string) => s === 'admin' || s === 'sub_admin',
}))
vi.mock('@/lib/useResolved', () => ({ useResolved: () => ({}) }))
vi.mock('@/lib/images', () => ({ HERO_BACKDROP: null, SAMPLE_PAGES: [] }))

// Stub the heavy visual children — LineCard emits just the line title.
vi.mock('@/components/LineCard', () => ({
  LineCard: ({ line }: { line: { title: string } }) => <div>card:{line.title}</div>,
}))
vi.mock('@/components/ActivityFeed', () => ({ ActivityFeed: () => null }))
vi.mock('@/components/KpiStrip', () => ({ KpiStrip: () => null }))
vi.mock('@/components/SampleStrip', () => ({ SampleStrip: () => null }))
vi.mock('@/components/SectionHead', () => ({ SectionHead: () => null }))

// ─── Fixtures ───────────────────────────────────────────────────────────────

const lineDocs = [
  { slug: 'biographies', title: 'Biographies', subtitle: '' },
  { slug: 'awareness', title: 'Awareness', subtitle: '' },
] as unknown as Line[]

const loaded = <T,>(data: T): Async<T> => ({ data, loading: false })

beforeEach(() => {
  mockUseLines = () => loaded(lineDocs)
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Home — allocation-aware line grid', () => {
  test('a moderator sees a card for every line, even ones with no visible comics', () => {
    mockUseUser = () => ({ user: { email: 'mod@x.com' }, loading: false })
    mockStatus = 'admin'
    mockUseVisibleComics = () => loaded<Comic[]>([{ slug: '01-a', line: 'biographies' } as unknown as Comic])

    render(<Home />)

    expect(screen.getByText('card:Biographies')).toBeInTheDocument()
    expect(screen.getByText('card:Awareness')).toBeInTheDocument()
  })

  test('a member sees cards only for lines with ≥1 visible comic', () => {
    mockUseUser = () => ({ user: { email: 'm@x.com' }, loading: false })
    mockStatus = 'allow'
    // Only a biographies comic is visible → the awareness card must drop.
    mockUseVisibleComics = () => loaded<Comic[]>([{ slug: '01-a', line: 'biographies' } as unknown as Comic])

    render(<Home />)

    expect(screen.getByText('card:Biographies')).toBeInTheDocument()
    expect(screen.queryByText('card:Awareness')).not.toBeInTheDocument()
  })

  test('a member with no visible comics sees no line cards', () => {
    mockUseUser = () => ({ user: { email: 'm@x.com' }, loading: false })
    mockStatus = 'allow'
    mockUseVisibleComics = () => loaded<Comic[]>([])

    render(<Home />)

    expect(screen.queryByText(/^card:/)).not.toBeInTheDocument()
  })
})

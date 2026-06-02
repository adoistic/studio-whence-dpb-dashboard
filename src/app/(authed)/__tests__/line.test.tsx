/**
 * Tests for src/app/(authed)/line/page.tsx
 *
 * The single data-driven /line page reads the line slug from the browser URL
 * (window.location.pathname) and resolves it against the loaded content. These
 * tests pin the PAGE's routing logic only:
 *
 *   1. pathname /biographies + content loaded → renders LinePageShell (line title shows)
 *   2. pathname /typo (slug absent from content) → graceful "line not found" state
 *   3. content still loading → quiet loading state
 *
 * LinePageShell is stubbed (it internally resolves images + renders tables, which
 * are out of scope here), and @/lib/intros is stubbed to keep the MDX import chain
 * out of this unit test. @/lib/content's useContent is mocked via the
 * forwarding-arrow pattern so the impl can be reassigned per test under hoisting.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Content } from '@/types/content'
import LinePage from '../line/page'

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUseContent: () => { content: Content | null; loading: boolean; error?: Error }

vi.mock('@/lib/content', () => ({
  useContent: () => mockUseContent(),
}))

// Stub LinePageShell — renders just the line title so "line title appears" holds,
// without dragging in image resolution / ComicsTable / TingalandGallery.
vi.mock('@/components/LinePageShell', () => ({
  LinePageShell: ({ line }: { line: { title: string } }) => <div>{line.title}</div>,
}))

// Stub the intro registry — the page guards on it, so an empty map is fine.
vi.mock('@/lib/intros', () => ({ INTROS: {} }))

// ─── Fixture ────────────────────────────────────────────────────────────────

const fixture: Content = {
  generated_at: '2026-06-01T00:00:00Z',
  source_sha: 'test',
  headline: { figures_researched: 0, comics_in_production: 1, lines_active: 4 },
  lines: [
    {
      slug: 'biographies',
      title: 'Biographies',
      subtitle: 'Little Chanakya Presents…',
      comics: [],
      figures: [],
    },
    { slug: 'awareness', title: 'Awareness', subtitle: '', comics: [], figures: [] },
    { slug: 'indic', title: 'Indic', subtitle: '', comics: [], figures: [] },
    { slug: 'toddlers', title: 'Toddlers', subtitle: '', comics: [], figures: [] },
  ],
  activity: [],
  images: [],
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function setPathname(pathname: string) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  setPathname('/')
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LinePage — data-driven /line routing', () => {
  test('renders LinePageShell for the line named by the URL slug', () => {
    setPathname('/biographies')
    mockUseContent = () => ({ content: fixture, loading: false })

    render(<LinePage />)

    expect(screen.getByText('Biographies')).toBeInTheDocument()
  })

  test('renders a graceful not-found state for a slug absent from content', () => {
    setPathname('/typo')
    mockUseContent = () => ({ content: fixture, loading: false })

    render(<LinePage />)

    // No crash, and the line title for a real line must not appear.
    expect(screen.queryByText('Biographies')).not.toBeInTheDocument()
    expect(screen.getByText(/line not found/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  test('renders a quiet loading state while content is loading', () => {
    setPathname('/biographies')
    mockUseContent = () => ({ content: null, loading: true })

    render(<LinePage />)

    expect(screen.queryByText('Biographies')).not.toBeInTheDocument()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  test('renders an error state when the content load finished but failed', () => {
    setPathname('/biographies')
    mockUseContent = () => ({ content: null, loading: false, error: new Error('boom') })

    render(<LinePage />)

    // A finished-but-failed load must not show the loading spinner forever,
    // and must not show a real line title.
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Biographies')).not.toBeInTheDocument()
    expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

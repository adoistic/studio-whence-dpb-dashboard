import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Content } from '@/types/content'
import ComicPage from '../comic/page'

let mockUseContent: () => { content: Content | null; loading: boolean; error?: Error }
vi.mock('@/lib/content', () => ({ useContent: () => mockUseContent() }))
vi.mock('@/components/ComicPageShell', () => ({
  ComicPageShell: ({ comic }: { comic: { title: string } }) => <div>{comic.title}</div>,
}))

const fixture: Content = {
  generated_at: '', source_sha: 'test',
  headline: { figures_researched: 0, comics_in_production: 1, lines_active: 4 },
  lines: [
    {
      slug: 'biographies', title: 'Biographies', subtitle: '',
      comics: [{ title: 'The Sky-High Dreamer', slug: '01-the-sky-high-dreamer', subject_slug: 'jrd-tata', line: 'biographies', status: 'draft' }],
      figures: [],
    },
  ],
  activity: [], images: [],
}

function setPathname(pathname: string) {
  Object.defineProperty(window, 'location', { value: { pathname }, writable: true, configurable: true })
}

beforeEach(() => setPathname('/'))

describe('ComicPage — data-driven /<line>/<slug> routing', () => {
  test('renders the comic named by the two URL segments', () => {
    setPathname('/biographies/01-the-sky-high-dreamer')
    mockUseContent = () => ({ content: fixture, loading: false })
    render(<ComicPage />)
    expect(screen.getByText('The Sky-High Dreamer')).toBeInTheDocument()
  })

  test('unknown comic slug → not found', () => {
    setPathname('/biographies/no-such-comic')
    mockUseContent = () => ({ content: fixture, loading: false })
    render(<ComicPage />)
    expect(screen.queryByText('The Sky-High Dreamer')).not.toBeInTheDocument()
    expect(screen.getByText(/comic not found/i)).toBeInTheDocument()
  })

  test('unknown line → not found', () => {
    setPathname('/nope/01-the-sky-high-dreamer')
    mockUseContent = () => ({ content: fixture, loading: false })
    render(<ComicPage />)
    expect(screen.getByText(/comic not found/i)).toBeInTheDocument()
  })

  test('loading state', () => {
    setPathname('/biographies/01-the-sky-high-dreamer')
    mockUseContent = () => ({ content: null, loading: true })
    render(<ComicPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  test('error state', () => {
    setPathname('/biographies/01-the-sky-high-dreamer')
    mockUseContent = () => ({ content: null, loading: false, error: new Error('boom') })
    render(<ComicPage />)
    // ErrorState is verbatim from the shipped /line page: the visible <p> AND the
    // effect-filled role="alert" region both match /couldn.t load/i, so scope to the
    // <p> exactly as the /line test does (line.test.tsx).
    expect(screen.getByText(/couldn.t load/i, { selector: 'p' })).toBeInTheDocument()
  })
})

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Comic } from '@/types/content'
import ComicPage from '../comic/page'

// useComic(line, slug) → { data: Comic|null, loading, error }; a missing doc
// surfaces as `error` ("comic not found"), which the page treats as not-found.
let mockUseComic: () => { data: Comic | null; loading: boolean; error?: Error }
vi.mock('@/lib/catalog', () => ({ useComic: () => mockUseComic() }))
vi.mock('@/components/ComicPageShell', () => ({
  ComicPageShell: ({ comic }: { comic: { title: string } }) => <div>{comic.title}</div>,
}))

const comic = {
  title: 'The Sky-High Dreamer', slug: '01-the-sky-high-dreamer',
  subject_slug: 'jrd-tata', line: 'biographies', status: 'draft',
} as Comic

function setPathname(pathname: string) {
  Object.defineProperty(window, 'location', { value: { pathname }, writable: true, configurable: true })
}

beforeEach(() => setPathname('/'))

describe('ComicPage — data-driven /<line>/<slug> routing', () => {
  test('renders the comic named by the two URL segments', () => {
    setPathname('/biographies/01-the-sky-high-dreamer')
    mockUseComic = () => ({ data: comic, loading: false })
    render(<ComicPage />)
    expect(screen.getByText('The Sky-High Dreamer')).toBeInTheDocument()
  })

  test('missing comic (useComic error) → not found', () => {
    setPathname('/biographies/no-such-comic')
    mockUseComic = () => ({ data: null, loading: false, error: new Error('comic not found') })
    render(<ComicPage />)
    expect(screen.queryByText('The Sky-High Dreamer')).not.toBeInTheDocument()
    expect(screen.getByText(/comic not found/i)).toBeInTheDocument()
  })

  test('null comic (no error) → not found', () => {
    setPathname('/nope/01-the-sky-high-dreamer')
    mockUseComic = () => ({ data: null, loading: false })
    render(<ComicPage />)
    expect(screen.getByText(/comic not found/i)).toBeInTheDocument()
  })

  test('loading state', () => {
    setPathname('/biographies/01-the-sky-high-dreamer')
    mockUseComic = () => ({ data: null, loading: true })
    render(<ComicPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})

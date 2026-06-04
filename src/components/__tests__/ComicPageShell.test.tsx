import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { Comic } from '@/types/content'
import { ComicPageShell } from '../ComicPageShell'

let mockDraft: () => { text: string | null; loading: boolean; error?: Error }
vi.mock('@/lib/useGatedText', () => ({ useGatedText: () => mockDraft() }))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
// Firestore catalog hooks: useFigure(slug) → { data: {figure,sources}|null }, and
// useComics(filters) → { data: Comic[]|null }. The citation map (provenance) is
// built from the subject figure's sources, and PersonTabs comes from useComics.
type FigData = { figure: { slug: string }; sources: { title: string; files: { path: string; title: string }[] }[] } | null
let mockFigure: () => { data: FigData; loading: boolean }
let mockComics: () => { data: { slug: string; line: string; title: string; status: string; comic_number?: number }[] | null; loading: boolean }
vi.mock('@/lib/catalog', () => ({
  useFigure: () => mockFigure(),
  useComics: () => mockComics(),
}))

// useProvenanceMarkers transitively imports dataApi → firebase; mock the leaf
// fetch so the test tree never initializes Firebase. readMarkdown only fires on
// hover, which this test doesn't trigger.
vi.mock('@/lib/dataApi', () => ({ readMarkdown: async () => '' }))

vi.mock('@/components/feedback/CommentGutter', () => ({
  CommentGutter: (props: { comicId: string; comicVersion: number; line: string }) => (
    <div data-testid="comment-gutter" data-comic-id={props.comicId} data-version={props.comicVersion} data-line={props.line} />
  ),
}))

vi.mock('@/components/feedback/CopyScriptToolbar', () => ({
  CopyScriptToolbar: (props: { comicId: string }) => (
    <div data-testid="copy-toolbar" data-comic-id={props.comicId} />
  ),
}))

const comic: Comic = {
  title: 'The Sky-High Dreamer',
  subject: 'J.R.D. Tata',
  line: 'biographies',
  series: 'Business Legends',
  comic_number: 1,
  status: 'draft',
  logline: 'The boy who fell in love with flight.',
  time_span: '1904–1993',
  target_length_pages: 48,
  target_age: '8–12',
  narrator: 'Little Chanakya',
  sources_count: 3,
  slug: '01-the-sky-high-dreamer',
  subject_slug: 'jrd-tata',
  changelog: [{ date: '2026-06-01', note: 'First draft' }],
}

beforeEach(() => {
  mockDraft = () => ({ text: null, loading: false })
  mockFigure = () => ({ data: { figure: { slug: 'jrd-tata' }, sources: [] }, loading: false })
  mockComics = () => ({
    data: [
      {
        slug: '01-the-sky-high-dreamer',
        line: 'biographies',
        title: 'The Sky-High Dreamer',
        status: 'draft',
        comic_number: 1,
      },
    ],
    loading: false,
  })
})

describe('ComicPageShell', () => {
  test('renders the masthead metadata', () => {
    render(<ComicPageShell comic={comic} />)
    expect(screen.getByRole('heading', { name: /the sky-high dreamer/i })).toBeInTheDocument()
    expect(screen.getByText('J.R.D. Tata')).toBeInTheDocument()
    expect(screen.getByText(/the boy who fell in love with flight/i)).toBeInTheDocument()
  })

  test('renders present spec fields + the changelog, and omits absent fields', () => {
    render(<ComicPageShell comic={comic} />)
    // present fields render
    expect(screen.getByText('48')).toBeInTheDocument()              // pages
    expect(screen.getByText('Little Chanakya')).toBeInTheDocument() // narrator
    expect(screen.getByText('First draft')).toBeInTheDocument()     // changelog note
    // an absent (Toddlers-only) field's label must NOT render — the fixture has no imprint
    expect(screen.queryByText(/imprint/i)).not.toBeInTheDocument()
  })

  test('injects the fetched draft html when present', () => {
    mockDraft = () => ({ text: '<h2>Page 1</h2><p>Open on a runway.</p>', loading: false })
    render(<ComicPageShell comic={comic} />)
    expect(screen.getByText(/open on a runway/i)).toBeInTheDocument()
  })

  test('shows the loading note while the draft loads', () => {
    mockDraft = () => ({ text: null, loading: true })
    render(<ComicPageShell comic={comic} />)
    expect(screen.getByText(/loading the script/i)).toBeInTheDocument()
  })

  test('shows a graceful note when no draft is available', () => {
    mockDraft = () => ({ text: null, loading: false, error: new Error('read failed: 404') })
    render(<ComicPageShell comic={comic} />)
    expect(screen.getByText(/draft not available yet/i)).toBeInTheDocument()
  })

  test('links the subject to its figure for a biographies comic with a matching figure', () => {
    render(<ComicPageShell comic={comic} />)
    const link = screen.getByRole('link', { name: 'J.R.D. Tata' })
    expect(link).toHaveAttribute('href', '/figures/jrd-tata')
  })

  test('renders the subject as plain text when no matching figure exists', () => {
    mockFigure = () => ({ data: null, loading: false })
    render(<ComicPageShell comic={comic} />)
    expect(screen.queryByRole('link', { name: 'J.R.D. Tata' })).not.toBeInTheDocument()
    expect(screen.getByText('J.R.D. Tata')).toBeInTheDocument()
  })

  test('mounts the PersonTabs strip — Comics active + a Research link — for a comic with a matching figure', () => {
    render(<ComicPageShell comic={comic} />)
    const nav = screen.getByRole('navigation', { name: /person sections/i })
    expect(nav).toBeInTheDocument()
    // Comics is the active (current) tab.
    expect(screen.getByText(/comics/i)).toHaveAttribute('aria-current', 'page')
    // The Research tab links to the figure page.
    const research = screen.getByRole('link', { name: /research/i })
    expect(research).toHaveAttribute('href', '/figures/jrd-tata')
  })

  test('renders NO strip when no matching figure exists', () => {
    mockFigure = () => ({ data: null, loading: false })
    render(<ComicPageShell comic={comic} />)
    expect(screen.queryByRole('navigation', { name: /person sections/i })).not.toBeInTheDocument()
  })

  test('renders NO strip for a non-biography comic', () => {
    const indicComic: Comic = { ...comic, line: 'indic', subject_slug: 'rama' }
    mockFigure = () => ({ data: null, loading: false })
    mockComics = () => ({ data: [], loading: false })
    render(<ComicPageShell comic={indicComic} />)
    expect(screen.queryByRole('navigation', { name: /person sections/i })).not.toBeInTheDocument()
  })

  test('mounts the comment gutter with the comic id, line and version', async () => {
    mockDraft = () => ({ text: '<h2>Page 1</h2><p>Open on a runway.</p>', loading: false })
    render(<ComicPageShell comic={comic} />)
    const gutter = await screen.findByTestId('comment-gutter')
    expect(gutter).toHaveAttribute('data-comic-id', `${comic.line}__${comic.slug}`)
    expect(gutter).toHaveAttribute('data-line', comic.line)
    expect(gutter).toHaveAttribute('data-version', String(comic.version ?? 0))
  })

  test('does not mount the comment gutter when draft is absent', () => {
    mockDraft = () => ({ text: null, loading: false })
    render(<ComicPageShell comic={comic} />)
    expect(screen.queryByTestId('comment-gutter')).not.toBeInTheDocument()
  })

  test('numbers provenance markers in the injected draft', async () => {
    const path = 'jrd-tata/the-sky-high-dreamer/chapters/01-flight.md'
    mockDraft = () => ({
      text:
        '<h2>Page 1</h2>' +
        '<p class="cs-caption">Open on a runway.' +
        `<a class="cs-src" href="#" data-figure="jrd-tata" data-key="${path}" data-line="2"` +
        ' aria-label="source: x, line 2">source</a></p>',
      loading: false,
    })
    mockFigure = () => ({
      data: {
        figure: { slug: 'jrd-tata' },
        sources: [{ title: 'The Sky-High Dreamer', files: [{ path, title: 'Flight' }] }],
      },
      loading: false,
    })
    const { container } = render(<ComicPageShell comic={comic} />)
    await waitFor(() => expect(container.querySelector('.cs-src')?.textContent).toBe('1'))
  })
})

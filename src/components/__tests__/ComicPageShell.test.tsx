import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Comic } from '@/types/content'
import { ComicPageShell } from '../ComicPageShell'

let mockDraft: () => { text: string | null; loading: boolean; error?: Error }
vi.mock('@/lib/useGatedText', () => ({ useGatedText: () => mockDraft() }))

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
})

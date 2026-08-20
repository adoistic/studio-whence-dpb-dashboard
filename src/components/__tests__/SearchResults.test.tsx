import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SearchResults } from '@/components/SearchResults'
import type { SearchResult } from '@/lib/search'

const state = {
  value: {
    data: null as SearchResult | null, loading: false, loadingMore: false,
    error: undefined as Error | undefined, loadMore: vi.fn(), hasMore: false,
  },
}
vi.mock('@/lib/search', () => ({ usePagedSearch: () => state.value }))

const hit = {
  comicId: 'biographies__01-the-brand-machine', line: 'biographies',
  slug: '01-the-brand-machine', title: 'The Brand Machine', lang: 'en', page: 12,
  snippet: '…we will make our own polyester…', refs: ['p12.pl1.b1'],
}
const base = { loading: false, loadingMore: false, error: undefined, loadMore: vi.fn(), hasMore: false }

describe('SearchResults', () => {
  test('shows a prompt before anything is typed', () => {
    state.value = { ...base, data: null }
    render(<SearchResults q="" />)
    expect(screen.getByText(/type a keyword/i)).toBeInTheDocument()
  })

  test('links a hit to its comic at the right page and language', () => {
    state.value = { ...base, data: { total: 1, hits: [hit] } }
    render(<SearchResults q="polyester" />)
    expect(screen.getByRole('link', { name: /the brand machine/i }))
      .toHaveAttribute('href', '/biographies/01-the-brand-machine?page=12&lang=en')
  })

  test('shows the page number and the snippet', () => {
    state.value = { ...base, data: { total: 1, hits: [hit] } }
    render(<SearchResults q="polyester" />)
    expect(screen.getByText(/page 12/i)).toBeInTheDocument()
    expect(screen.getByText(/make our own polyester/i)).toBeInTheDocument()
  })

  test('tags a translated hit with its language', () => {
    state.value = { ...base, data: { total: 1, hits: [{ ...hit, lang: 'hi', snippet: '…पॉलिएस्टर…' }] } }
    render(<SearchResults q="polyester" />)
    expect(screen.getByText('हिंदी')).toBeInTheDocument()
  })

  test('says so plainly when there is nothing', () => {
    state.value = { ...base, data: { total: 0, hits: [] } }
    render(<SearchResults q="zzzz" />)
    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument()
  })

  test('reports a failure rather than pretending there were no results', () => {
    state.value = { ...base, data: null, error: new Error('search failed: 503') }
    render(<SearchResults q="x" />)
    expect(screen.getByText(/search is unavailable/i)).toBeInTheDocument()
  })

  test('offers load more with the remaining count when there is more', () => {
    state.value = { ...base, data: { total: 120, hits: [hit] }, hasMore: true }
    render(<SearchResults q="polyester" />)
    expect(screen.getByRole('button', { name: /load more \(119 left\)/i })).toBeInTheDocument()
  })
})

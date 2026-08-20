import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SearchPage from '@/app/(authed)/search/page'

// The live search params, swapped between renders to simulate a router.push
// from the top-bar search box while already on /search.
const params = { value: new URLSearchParams('q=yoga') }
vi.mock('next/navigation', () => ({
  useSearchParams: () => params.value,
  useRouter: () => ({ push: vi.fn() }),
}))

const seen: string[] = []
vi.mock('@/components/SearchResults', () => ({
  SearchResults: ({ q }: { q: string }) => {
    seen.push(q)
    return <div data-testid="results">{q}</div>
  },
}))

describe('SearchPage', () => {
  test('shows the query from the URL', () => {
    params.value = new URLSearchParams('q=yoga')
    render(<SearchPage />)
    expect(screen.getByTestId('results')).toHaveTextContent('yoga')
  })

  test('REGRESSION: searching a NEW term while already on /search updates the results', () => {
    params.value = new URLSearchParams('q=yoga')
    const { rerender } = render(<SearchPage />)
    expect(screen.getByTestId('results')).toHaveTextContent('yoga')

    // router.push('/search?q=pranayama') — pushState does NOT fire popstate,
    // so a window-based reader would stay stuck on the old term.
    params.value = new URLSearchParams('q=pranayama')
    rerender(<SearchPage />)
    expect(screen.getByTestId('results')).toHaveTextContent('pranayama')
  })

  test('an absent q renders the empty state, not a stale one', () => {
    params.value = new URLSearchParams('')
    render(<SearchPage />)
    expect(screen.getByTestId('results')).toHaveTextContent('')
  })
})

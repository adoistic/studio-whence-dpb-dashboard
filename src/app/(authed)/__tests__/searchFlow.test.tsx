import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBox } from '@/components/SearchBox'
import SearchPage from '@/app/(authed)/search/page'

/**
 * The journey that actually broke in production: you are already on /search,
 * you change the term in the top-bar box, and you expect new results.
 *
 * router.push updates the URL via pushState, which does NOT fire `popstate`.
 * The page therefore has to read the query from the ROUTER, not from
 * window.location — reading the window left the old results on screen.
 */
const params = { value: new URLSearchParams('q=yoga') }
const push = vi.fn((url: string) => {
  params.value = new URLSearchParams(url.split('?')[1] ?? '')
})
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params.value,
}))

vi.mock('@/components/SearchResults', () => ({
  SearchResults: ({ q }: { q: string }) => <div data-testid="results">results for: {q}</div>,
}))

function App() {
  return <><SearchBox /><SearchPage /></>
}

describe('changing the search term while already on /search', () => {
  test('the results follow the new term', () => {
    params.value = new URLSearchParams('q=yoga')
    const { rerender } = render(<App />)
    expect(screen.getByTestId('results')).toHaveTextContent('results for: yoga')

    const input = screen.getAllByRole('searchbox')[0]
    expect(input).toHaveValue('yoga')          // editable, not blank

    fireEvent.change(input, { target: { value: 'pranayama' } })
    fireEvent.submit(input)
    expect(push).toHaveBeenCalledWith('/search?q=pranayama')

    // The router navigated; React re-renders with the new params.
    rerender(<App />)
    expect(screen.getByTestId('results')).toHaveTextContent('results for: pranayama')
    expect(screen.getAllByRole('searchbox')[0]).toHaveValue('pranayama')
  })
})

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBox } from '@/components/SearchBox'

const push = vi.fn()
const params = { value: new URLSearchParams('') }
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params.value,
}))

beforeEach(() => { push.mockClear(); params.value = new URLSearchParams('') })

describe('SearchBox', () => {
  test('submitting navigates to the results page with the query encoded', () => {
    render(<SearchBox />)
    const input = screen.getAllByRole('searchbox')[0]
    fireEvent.change(input, { target: { value: 'polyester prince' } })
    fireEvent.submit(input)
    expect(push).toHaveBeenCalledWith('/search?q=polyester+prince')
  })

  test('an empty query does not navigate', () => {
    render(<SearchBox />)
    const input = screen.getAllByRole('searchbox')[0]
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input)
    expect(push).not.toHaveBeenCalled()
  })

  test('the rules are available without leaving the page', () => {
    render(<SearchBox />)
    fireEvent.click(screen.getAllByRole('button', { name: /search rules/i })[0])
    expect(screen.getAllByText(/exact phrase/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/either one/i).length).toBeGreaterThan(0)
  })

  test('slash focuses the input', () => {
    render(<SearchBox />)
    fireEvent.keyDown(window, { key: '/' })
    expect(screen.getAllByRole('searchbox')[0]).toHaveFocus()
  })

  test('slash typed inside a field does not steal focus', () => {
    render(<><SearchBox /><textarea aria-label="note" /></>)
    const note = screen.getByLabelText('note')
    note.focus()
    fireEvent.keyDown(note, { key: '/' })
    expect(note).toHaveFocus()
  })

  test('the mobile trigger opens a full-screen sheet', () => {
    render(<SearchBox />)
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }))
    expect(screen.getByRole('dialog', { name: /search/i })).toBeInTheDocument()
  })

  test('pre-fills with the current query so the term can be EDITED, not retyped', () => {
    params.value = new URLSearchParams('q=yoga')
    render(<SearchBox />)
    expect(screen.getAllByRole('searchbox')[0]).toHaveValue('yoga')
  })

  test('editing a pre-filled term searches the new one', () => {
    params.value = new URLSearchParams('q=yoga')
    render(<SearchBox />)
    const input = screen.getAllByRole('searchbox')[0]
    fireEvent.change(input, { target: { value: 'pranayama' } })
    fireEvent.submit(input)
    expect(push).toHaveBeenCalledWith('/search?q=pranayama')
  })
})

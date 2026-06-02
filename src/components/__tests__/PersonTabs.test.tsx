import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PersonTabs } from '../PersonTabs'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

const comics = [
  { slug: 'c1', line: 'biographies', title: 'The Sky-High Dreamer', status: 'approved' as const, comic_number: 1 },
  { slug: 'c2', line: 'biographies', title: 'The Salt Years', status: 'draft' as const, comic_number: 2 },
]

describe('PersonTabs', () => {
  test('research-active: Comics tab links to the furthest-stage comic with the count', () => {
    render(<PersonTabs figureSlug="jrd-tata" comics={comics} active="research" />)
    const comicsTab = screen.getByRole('link', { name: /comics/i })
    expect(comicsTab).toHaveAttribute('href', '/biographies/c1')  // 'approved' > 'draft'
    expect(comicsTab).toHaveTextContent('2')
    expect(screen.getByText('Research')).toBeInTheDocument()        // active, not a link
    expect(screen.queryByRole('link', { name: /^research$/i })).not.toBeInTheDocument()
  })
  test('no comics: Comics tab is a disabled "No comic yet", not a link', () => {
    render(<PersonTabs figureSlug="gd-birla" comics={[]} active="research" />)
    expect(screen.getByText(/no comic yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /comics/i })).not.toBeInTheDocument()
  })
  test('null figureSlug: Research renders as a non-link span', () => {
    render(<PersonTabs figureSlug={null} comics={comics} active="comics" activeComicSlug="c1" />)
    expect(screen.queryByRole('link', { name: /research/i })).toBeNull()
    expect(screen.getByText('Research')).toBeInTheDocument()
  })
  test('comics-active: Research links to the figure; sibling chips list the comics', () => {
    render(<PersonTabs figureSlug="jrd-tata" comics={comics} active="comics" activeComicSlug="c1" />)
    expect(screen.getByRole('link', { name: /research/i })).toHaveAttribute('href', '/figures/jrd-tata')
    expect(screen.getByRole('link', { name: /the salt years/i })).toHaveAttribute('href', '/biographies/c2')
    expect(screen.getByText('The Sky-High Dreamer')).toHaveAttribute('aria-current', 'page') // active sibling chip
  })
})

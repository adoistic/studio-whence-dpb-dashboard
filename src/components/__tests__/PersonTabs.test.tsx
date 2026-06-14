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
  test('comics-active, non-edition subject: Research links to the figure; the switcher falls back to (prefix-stripped) titles', () => {
    render(<PersonTabs figureSlug="jrd-tata" comics={comics} active="comics" activeComicSlug="c1" />)
    expect(screen.getByRole('link', { name: /research/i })).toHaveAttribute('href', '/figures/jrd-tata')
    // No -standard/-premium slugs → titles, with the shared "The" prefix stripped.
    expect(screen.getByRole('link', { name: /salt years/i })).toHaveAttribute('href', '/biographies/c2')
    const active = screen.getByText(/sky-high dreamer/i)
    expect(active.closest('[aria-current="page"]')).not.toBeNull()
    // No "Standard"/"Premium" wording for a plain biography pairing.
    expect(screen.queryByText(/standard/i)).toBeNull()
    expect(screen.queryByText(/premium/i)).toBeNull()
  })

  const editions = [
    { slug: '01-x-standard', line: 'medicomics', title: 'Little Chanakya and the Pink Ribbon Mystery', status: 'in-review' as const, comic_number: 1, target_length_pages: 24 },
    { slug: '02-x-premium', line: 'medicomics', title: 'Little Chanakya and the Pink Ribbon Mystery (Understanding Breast Cancer) — Premium 48pp edition', status: 'in-review' as const, comic_number: 2, target_length_pages: 48 },
  ]

  test('comics-active, edition subject: renders a labeled "Standard · 24 pages" / "Premium · 48 pages" switcher', () => {
    render(<PersonTabs figureSlug="breast-cancer" comics={editions} active="comics" activeComicSlug="01-x-standard" />)
    const tablist = screen.getByRole('tablist', { name: /editions/i })
    expect(tablist).toBeInTheDocument()
    // Short, distinguishing labels — not the long raw titles.
    expect(screen.getByText('Standard')).toBeInTheDocument()
    expect(screen.getByText('24 pages')).toBeInTheDocument()
    expect(screen.getByText('Premium')).toBeInTheDocument()
    expect(screen.getByText('48 pages')).toBeInTheDocument()
    expect(screen.queryByText(/understanding breast cancer/i)).toBeNull()
    // Active = Standard (non-link), Premium links to its slug.
    const standard = screen.getByText('Standard')
    expect(standard.closest('[aria-current="page"]')).not.toBeNull()
    const premiumLink = screen.getByText('Premium').closest('a')
    expect(premiumLink).toHaveAttribute('href', '/medicomics/02-x-premium')
    // It says how many editions there are.
    expect(screen.getByText(/2 editions/i)).toBeInTheDocument()
  })

  test('single comic: no switcher renders', () => {
    render(<PersonTabs figureSlug="breast-cancer" comics={[editions[0]]} active="comics" activeComicSlug="01-x-standard" />)
    expect(screen.queryByRole('tablist', { name: /editions/i })).toBeNull()
    expect(screen.queryByText(/editions/i)).toBeNull()
  })
})

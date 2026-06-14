import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComicEditions } from '../ComicEditions'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

const editions = [
  { slug: '01-x-standard', line: 'medicomics', title: 'Little Chanakya and the Pink Ribbon Mystery', status: 'in-review' as const, comic_number: 1, target_length_pages: 24 },
  { slug: '02-x-premium', line: 'medicomics', title: 'Little Chanakya and the Pink Ribbon Mystery (Understanding Breast Cancer) — Premium 48pp edition', status: 'in-review' as const, comic_number: 2, target_length_pages: 48 },
]

describe('ComicEditions', () => {
  test('multi-edition subject: shows the REAL titles; active filled, others link out', () => {
    render(<ComicEditions comics={editions} activeSlug="01-x-standard" />)
    expect(screen.getByRole('tablist', { name: /editions/i })).toBeInTheDocument()
    expect(screen.getByText(/2 editions/i)).toBeInTheDocument()
    // Real titles verbatim — no extrapolated "Standard"/"Premium" labels.
    const active = screen.getByText('Little Chanakya and the Pink Ribbon Mystery')
    expect(active.closest('[aria-current="page"]')).not.toBeNull() // active, non-link
    const premium = screen.getByText(/understanding breast cancer/i) // the other edition's real title
    expect(premium.closest('a')).toHaveAttribute('href', '/medicomics/02-x-premium')
  })
  test('single comic: renders nothing (no band)', () => {
    const { container } = render(<ComicEditions comics={[editions[0]]} activeSlug="01-x-standard" />)
    expect(container).toBeEmptyDOMElement()
  })
})

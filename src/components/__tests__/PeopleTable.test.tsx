import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PersonRow } from '@/lib/people'
import { PeopleTable } from '../PeopleTable'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

const rows: PersonRow[] = [
  { slug: 'jrd-tata', name: 'Jrd Tata', series: '01-Business-Legends', stage: 'published', stageRank: 5, comicCount: 2, sourcesCount: 3, words: 120000, href: '/figures/jrd-tata' },
  { slug: 'gd-birla', name: 'Gd Birla', series: '01-Business-Legends', stage: 'researched', stageRank: 0, comicCount: 0, sourcesCount: 4, words: 96000, href: '/figures/gd-birla' },
]

describe('PeopleTable', () => {
  test('a person row links to its href and shows the Stage', () => {
    render(<PeopleTable people={rows} filename="x.csv" />)
    const link = screen.getByRole('link', { name: /jrd tata/i })
    expect(link).toHaveAttribute('href', '/figures/jrd-tata')
    expect(screen.getByText(/published/i)).toBeInTheDocument()
    expect(screen.getByText(/researched/i)).toBeInTheDocument()
  })
  test('a multi-comic person shows the comic count', () => {
    render(<PeopleTable people={rows} filename="x.csv" />)
    expect(screen.getByText(/2 comics/i)).toBeInTheDocument()
  })
})

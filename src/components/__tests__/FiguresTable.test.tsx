import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Figure } from '@/types/content'
import { FiguresTable } from '../FiguresTable'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

const figures: Figure[] = [
  { series: '01-Business-Legends', slug: 'dhirubhai-ambani', sources_count: 3, words: 120000 },
]

describe('FiguresTable', () => {
  test('rows link to /figures/<slug>, resolvable by the figure name', () => {
    render(<FiguresTable figures={figures} filename="x.csv" />)
    const link = screen.getByRole('link', { name: /dhirubhai ambani/i })
    expect(link).toHaveAttribute('href', '/figures/dhirubhai-ambani')
  })
})

import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Comic } from '@/types/content'
import { ComicsTable } from '../ComicsTable'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

// Realistic shape: a comic carries a subject, so the first cell renders the
// title PLUS a "subject · time_span" sub-line — the rowHref wraps the whole
// first-cell content, so the link's accessible name includes that sub-line.
// The /<regex>/i on getByRole('link', {name}) matches the accessible name as a
// substring, so the link still resolves by its title.
const comics: Comic[] = [
  { title: 'The Sky-High Dreamer', subject: 'J.R.D. Tata', time_span: '1904–1993', slug: '01-the-sky-high-dreamer', subject_slug: 'jrd-tata', line: 'biographies', status: 'draft' },
]

describe('ComicsTable row links', () => {
  test('the title cell links to /<line>/<slug> and resolves by title', () => {
    render(<ComicsTable comics={comics} filename="x.csv" />)
    const link = screen.getByRole('link', { name: /the sky-high dreamer/i })
    expect(link).toHaveAttribute('href', '/biographies/01-the-sky-high-dreamer')
  })
})

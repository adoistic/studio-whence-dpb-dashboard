import { render, screen } from '@testing-library/react'
import { ActivityFeed } from '../ActivityFeed'
import type { ActivityEntry } from '@/types/content'

// Build 10 fake entries with distinct titles + stable SHAs
function makeEntries(count: number): ActivityEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    sha: `sha${String(i).padStart(3, '0')}`,
    date: `2026-05-${String(30 - i).padStart(2, '0')}T10:00:00Z`,
    title: `Comic update number ${i + 1}`,
  }))
}

describe('ActivityFeed — happy path', () => {
  const entries = makeEntries(10)

  test('renders only 8 entries by default (limit=8)', () => {
    render(<ActivityFeed entries={entries} />)
    // Entry 9 and 10 should NOT appear
    expect(screen.queryByText('Comic update number 9')).toBeNull()
    expect(screen.queryByText('Comic update number 10')).toBeNull()
  })

  test('renders the first entry title', () => {
    render(<ActivityFeed entries={entries} />)
    expect(screen.getByText('Comic update number 1')).toBeVisible()
  })

  test('renders 8 gold-dot bullets for 8 entries', () => {
    render(<ActivityFeed entries={entries} />)
    // Each entry row has a span with aria-hidden that acts as the gold dot
    const dots = screen.getAllByTestId('gold-dot')
    expect(dots).toHaveLength(8)
  })

  test('custom limit prop is respected', () => {
    render(<ActivityFeed entries={entries} limit={3} />)
    expect(screen.getByText('Comic update number 3')).toBeVisible()
    expect(screen.queryByText('Comic update number 4')).toBeNull()
  })
})

describe('ActivityFeed — empty state', () => {
  test('renders quiet fallback for empty entries array', () => {
    render(<ActivityFeed entries={[]} />)
    expect(screen.getByText(/no recent activity/i)).toBeVisible()
  })
})

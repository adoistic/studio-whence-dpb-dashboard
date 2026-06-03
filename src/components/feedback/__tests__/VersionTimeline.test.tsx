import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VersionTimeline } from '@/components/feedback/VersionTimeline'

const log = [
  { date: '2026-05-29', note: 'Initial draft.' },
  { date: '2026-06-03', note: 'Fact-check pass v1.' },
]

it('renders newest-first with version numbers and marks the latest current', () => {
  const { container } = render(<VersionTimeline changelog={log} version={2} />)
  const items = container.querySelectorAll('li')
  expect(items.length).toBe(2)
  // newest (v2) first
  expect(items[0].textContent).toContain('Fact-check pass v1.')
  expect(items[0].textContent).toMatch(/v2/)
  expect(items[0].textContent).toMatch(/current/i)
  // older (v1) second, not marked current
  expect(items[1].textContent).toContain('Initial draft.')
  expect(items[1].textContent).toMatch(/v1/)
})

it('tolerates bare-string changelog entries', () => {
  render(<VersionTimeline changelog={['just a note']} version={1} />)
  expect(screen.getByText(/just a note/)).toBeInTheDocument()
})

it('renders nothing when changelog is empty', () => {
  const { container } = render(<VersionTimeline changelog={[]} />)
  expect(container.querySelectorAll('li').length).toBe(0)
})

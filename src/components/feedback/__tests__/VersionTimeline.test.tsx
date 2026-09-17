import { it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
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

it('shows a Script tab and an Artwork tab when both histories exist', () => {
  render(
    <VersionTimeline
      changelog={[{ date: '2026-09-04', note: 'script work' }]}
      artChangelog={[{ date: '2026-09-12', note: '28 pages re-rendered' }]}
    />,
  )
  expect(screen.getByRole('tab', { name: /script/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /artwork/i })).toBeInTheDocument()
})

it('hides the Artwork tab when the book has no artwork history', () => {
  render(<VersionTimeline changelog={[{ note: 'script only' }]} />)
  expect(screen.queryByRole('tab', { name: /artwork/i })).toBeNull()
})

it('shows the Corrections tab with its open count', () => {
  render(
    <VersionTimeline
      changelog={[{ note: 'x' }]}
      corrections={{
        items: [
          { id: 'SC-04', source: 'register', summary: 'markers', state: 'applied' },
          { id: 'p-1', source: 'portal', summary: 'bubbles', state: 'needs-decision' },
        ],
        counts: { applied: 1, raisedWithDiamond: 0, needsDecision: 1 },
        total: 2,
      }}
    />,
  )
  expect(screen.getByRole('tab', { name: /corrections/i })).toBeInTheDocument()
})

// ── The reason these tabs exist: one date could not answer two questions ─────

it('puts both the script date and the artwork date in the header, unclicked', () => {
  const { container } = render(
    <VersionTimeline
      changelog={[{ date: '2026-09-04', note: 'script work' }]}
      artChangelog={[{ date: '2026-09-12', note: '28 pages re-rendered' }]}
    />,
  )
  const head = container.querySelector('header')!
  expect(head.textContent).toMatch(/Script\s*4 Sep/)
  expect(head.textContent).toMatch(/Artwork\s*12 Sep/)
})

it('omits the artwork side of the header when there is no artwork date', () => {
  const { container } = render(<VersionTimeline changelog={[{ date: '2026-09-04', note: 'x' }]} />)
  expect(container.querySelector('header')!.textContent).not.toMatch(/Artwork/i)
})

it('prefers artUpdated over the last art changelog date', () => {
  const { container } = render(
    <VersionTimeline
      changelog={[{ date: '2026-09-04', note: 'x' }]}
      artChangelog={[{ date: '2026-09-12', note: 'pages' }]}
      artUpdated="2026-09-15"
    />,
  )
  expect(container.querySelector('header')!.textContent).toMatch(/Artwork\s*15 Sep/)
})

it('defaults to the Script panel and switches to Artwork on click', () => {
  render(
    <VersionTimeline
      changelog={[{ date: '2026-09-04', note: 'script work' }]}
      artChangelog={[{ date: '2026-09-12', note: '28 pages re-rendered' }]}
    />,
  )
  expect(screen.getByRole('tab', { name: /script/i })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('script work')).toBeInTheDocument()
  expect(screen.queryByText('28 pages re-rendered')).toBeNull()

  fireEvent.click(screen.getByRole('tab', { name: /artwork/i }))
  expect(screen.getByRole('tab', { name: /artwork/i })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('28 pages re-rendered')).toBeInTheDocument()
  expect(screen.queryByText('script work')).toBeNull()
})

it('numbers artwork entries too and tolerates bare strings there', () => {
  render(
    <VersionTimeline
      changelog={[{ note: 'x' }]}
      artChangelog={['bare art note', { date: '2026-09-12', note: 'later art note' }]}
    />,
  )
  fireEvent.click(screen.getByRole('tab', { name: /artwork/i }))
  const panel = screen.getByRole('tabpanel')
  const items = panel.querySelectorAll('li')
  expect(items.length).toBe(2)
  expect(items[0].textContent).toContain('later art note')
  expect(items[0].textContent).toMatch(/v2/)
  expect(items[1].textContent).toContain('bare art note')
})

it('moves between tabs with the arrow keys', () => {
  render(
    <VersionTimeline
      changelog={[{ note: 'x' }]}
      artChangelog={[{ note: 'y' }]}
      corrections={{
        items: [{ id: 'a', source: 'portal', summary: 'z', state: 'applied' }],
        counts: { applied: 1, raisedWithDiamond: 0, needsDecision: 0 },
        total: 1,
      }}
    />,
  )
  const script = screen.getByRole('tab', { name: /script/i })
  fireEvent.keyDown(script, { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: /artwork/i })).toHaveAttribute('aria-selected', 'true')

  fireEvent.keyDown(screen.getByRole('tab', { name: /artwork/i }), { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: /corrections/i })).toHaveAttribute('aria-selected', 'true')

  // wraps back round to Script
  fireEvent.keyDown(screen.getByRole('tab', { name: /corrections/i }), { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: /script/i })).toHaveAttribute('aria-selected', 'true')

  fireEvent.keyDown(screen.getByRole('tab', { name: /script/i }), { key: 'ArrowLeft' })
  expect(screen.getByRole('tab', { name: /corrections/i })).toHaveAttribute('aria-selected', 'true')
})

it('lists unresolved corrections before applied ones', () => {
  render(
    <VersionTimeline
      changelog={[{ note: 'x' }]}
      corrections={{
        items: [
          { id: 'SC-04', source: 'register', page: 4, summary: 'markers', state: 'applied' },
          { id: 'SC-09', source: 'register', page: 9, summary: 'era kit', state: 'raised-with-diamond' },
          { id: 'p-1', source: 'portal', page: 1, summary: 'bubbles', state: 'needs-decision' },
        ],
        counts: { applied: 1, raisedWithDiamond: 1, needsDecision: 1 },
        total: 3,
      }}
    />,
  )
  fireEvent.click(screen.getByRole('tab', { name: /corrections/i }))
  const rows = screen.getByRole('tabpanel').querySelectorAll('li')
  expect(rows.length).toBe(3)
  expect(rows[0].textContent).toContain('bubbles')
  expect(rows[1].textContent).toContain('era kit')
  expect(rows[2].textContent).toContain('markers')
})

it('shows each correction page, state and note', () => {
  render(
    <VersionTimeline
      changelog={[{ note: 'x' }]}
      corrections={{
        items: [
          {
            id: 'SC-04',
            source: 'register',
            page: 12,
            summary: 'stray marker lettered as a caption',
            state: 'needs-decision',
            note: 'waiting on Diamond',
          },
        ],
        counts: { applied: 0, raisedWithDiamond: 0, needsDecision: 1 },
        total: 1,
      }}
    />,
  )
  fireEvent.click(screen.getByRole('tab', { name: /corrections/i }))
  const row = within(screen.getByRole('tabpanel')).getByRole('listitem')
  expect(row.textContent).toMatch(/p\.?\s*12/i)
  expect(row.textContent).toContain('stray marker lettered as a caption')
  expect(row.textContent).toMatch(/needs decision/i)
  expect(row.textContent).toContain('waiting on Diamond')
})

it('renders the corrections counts', () => {
  render(
    <VersionTimeline
      changelog={[{ note: 'x' }]}
      corrections={{
        items: [
          { id: 'a', source: 'portal', summary: 'one', state: 'applied' },
          { id: 'b', source: 'portal', summary: 'two', state: 'raised-with-diamond' },
        ],
        counts: { applied: 1, raisedWithDiamond: 1, needsDecision: 0 },
        total: 2,
      }}
    />,
  )
  fireEvent.click(screen.getByRole('tab', { name: /corrections/i }))
  const panel = screen.getByRole('tabpanel')
  expect(panel.textContent).toMatch(/1 applied/i)
  expect(panel.textContent).toMatch(/1 raised with Diamond/i)
})

it('hides the Corrections tab when the ledger is empty', () => {
  render(
    <VersionTimeline
      changelog={[{ note: 'x' }]}
      corrections={{
        items: [],
        counts: { applied: 0, raisedWithDiamond: 0, needsDecision: 0 },
        total: 0,
      }}
    />,
  )
  expect(screen.queryByRole('tab', { name: /corrections/i })).toBeNull()
})

it('renders the artwork history even when the script has no changelog', () => {
  render(
    <VersionTimeline changelog={[]} artChangelog={[{ date: '2026-09-12', note: 'pages redone' }]} />,
  )
  expect(screen.getByRole('tab', { name: /artwork/i })).toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: /script/i })).toBeNull()
  expect(screen.getByText('pages redone')).toBeInTheDocument()
})

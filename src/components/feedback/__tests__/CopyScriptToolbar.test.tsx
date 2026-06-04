import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Thread, FeedbackNode } from '@/lib/feedbackTypes'

const DRAFT = `
<section class="cs-page" data-page-ref="p1"><h2 class="cs-page-h">Page 1</h2>
  <div class="cs-panel" data-panel-ref="p1.pl1"><p class="cs-panel-h">Panel 1</p>
    <p class="cs-art" data-beat-ref="p1.pl1.art">A wide shot.</p>
    <p class="cs-dialogue" data-beat-ref="p1.pl1.b1"><span class="cs-name">HERO</span>Hello.</p>
  </div>
</section>`

function node(over: Partial<FeedbackNode>): FeedbackNode {
  return {
    id: 'x', comicId: 'c', line: 'biographies', parentId: null, anchors: [],
    authorEmail: 'a@x.com', authorName: 'Ankit', authorRole: 'allow',
    body: 'a note', status: 'open', category: 'fact', comicVersion: 1, hidden: false,
    createdAt: 1000, ...over,
  }
}
// `published: true` → an approved comment, included in the default copy.
let threadData: Thread[] = [
  { root: node({ id: 'g1', anchors: [], body: 'general note', published: true }), replies: [] },
]

vi.mock('@/lib/feedback', () => ({
  useComicFeedback: () => ({ data: threadData, loading: false }),
}))

// The toolbar reads the viewer's role to scope the gated read AND to decide
// whether to show the "Include drafts" toggle. Driven per-test via `allowStatus`.
let allowStatus = 'allow'
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: { email: 'me@x.com' }, loading: false }),
  useAllowStatus: () => allowStatus,
  canModerate: (s: string) => s === 'admin' || s === 'sub_admin',
}))

import { CopyScriptToolbar } from '@/components/feedback/CopyScriptToolbar'

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  writeText.mockClear()
  allowStatus = 'allow'
  threadData = [
    { root: node({ id: 'g1', anchors: [], body: 'general note', published: true }), replies: [] },
  ]
  Object.assign(navigator, { clipboard: { writeText } })
})

describe('CopyScriptToolbar', () => {
  it('copies the plain script on "Copy script"', async () => {
    render(<CopyScriptToolbar comicId="c" comicTitle="Demo" draftText={DRAFT} />)
    fireEvent.click(screen.getByRole('button', { name: /copy the script as plain text/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const text = writeText.mock.calls[0][0] as string
    expect(text).toContain('## Page 1')
    expect(text).toContain('HERO: Hello.')
    expect(text).not.toContain('─── COMMENTS ───')
  })

  it('copies script + comments (includes the COMMENTS appendix)', async () => {
    render(<CopyScriptToolbar comicId="c" comicTitle="Demo" draftText={DRAFT} />)
    fireEvent.click(screen.getByRole('button', { name: /copy the script with editorial comments/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const text = writeText.mock.calls[0][0] as string
    expect(text).toContain('─── COMMENTS ───')
    expect(text).toContain('general note')
  })

  it('shows "Copied" after a click', async () => {
    render(<CopyScriptToolbar comicId="c" comicTitle="Demo" draftText={DRAFT} />)
    const btn = screen.getByRole('button', { name: /copy the script as plain text/i })
    fireEvent.click(btn)
    await waitFor(() => expect(btn.textContent).toMatch(/Copied/))
  })

  it('shows the "Include drafts" checkbox for a moderator, not for a member', () => {
    const { unmount } = render(<CopyScriptToolbar comicId="c" comicTitle="Demo" draftText={DRAFT} />)
    expect(screen.queryByLabelText(/include drafts/i)).toBeNull()
    unmount()
    allowStatus = 'sub_admin'
    render(<CopyScriptToolbar comicId="c" comicTitle="Demo" draftText={DRAFT} />)
    expect(screen.getByLabelText(/include drafts/i)).toBeInTheDocument()
  })

  it('a moderator toggling "Include drafts" includes draft comments in the copy', async () => {
    allowStatus = 'sub_admin'
    threadData = [
      { root: node({ id: 'd1', anchors: [], body: 'draft note', published: false }), replies: [] },
    ]
    render(<CopyScriptToolbar comicId="c" comicTitle="Demo" draftText={DRAFT} />)

    // Default OFF → the draft note is excluded.
    fireEvent.click(screen.getByRole('button', { name: /copy the script with editorial comments/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText.mock.calls[0][0] as string).not.toContain('draft note')

    // Toggle ON → the draft note is included.
    fireEvent.click(screen.getByLabelText(/include drafts/i))
    fireEvent.click(screen.getByRole('button', { name: /copy the script with editorial comments/i }))
    await waitFor(() => expect(writeText.mock.calls.length).toBeGreaterThan(1))
    const last = writeText.mock.calls[writeText.mock.calls.length - 1][0] as string
    expect(last).toContain('draft note')
  })

  it('disables both buttons when draftText is null', () => {
    render(<CopyScriptToolbar comicId="c" comicTitle="Demo" draftText={null} />)
    expect(screen.getByRole('button', { name: /copy the script as plain text/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /copy the script with editorial comments/i })).toBeDisabled()
  })
})

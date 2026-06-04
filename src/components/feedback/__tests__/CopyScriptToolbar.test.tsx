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
const threadData: Thread[] = [{ root: node({ id: 'g1', anchors: [], body: 'general note' }), replies: [] }]

vi.mock('@/lib/feedback', () => ({
  useComicFeedback: () => ({ data: threadData, loading: false }),
}))

import { CopyScriptToolbar } from '@/components/feedback/CopyScriptToolbar'

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  writeText.mockClear()
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

  it('disables both buttons when draftText is null', () => {
    render(<CopyScriptToolbar comicId="c" comicTitle="Demo" draftText={null} />)
    expect(screen.getByRole('button', { name: /copy the script as plain text/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /copy the script with editorial comments/i })).toBeDisabled()
  })
})

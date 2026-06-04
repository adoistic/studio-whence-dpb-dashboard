import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommentThread } from '@/components/feedback/CommentThread'
import type { Thread } from '@/lib/feedbackTypes'

const mkThread = (over: Partial<Thread['root']> = {}): Thread => ({
  root: {
    id: 'r1', comicId: 'c', line: 'biographies', parentId: null,
    anchors: [{ kind: 'beat', ref: 'p13.pl1.b1', page: 13, panel: 1, snapshot: 'old text' }],
    authorEmail: 'ankit@x.com', authorName: 'Ankit', authorRole: 'editor',
    body: 'Check this date.', status: 'open', comicVersion: 1, hidden: false, createdAt: '2026-06-03', ...over,
  },
  replies: [{ id: 'p1', comicId: 'c', line: 'biographies', parentId: 'r1', anchors: [],
    authorEmail: 'adnan@thothica.com', authorName: 'Studio', authorRole: 'admin',
    body: 'Fixed.', comicVersion: 1, hidden: false, createdAt: '2026-06-03' }],
})
const base = {
  badge: { num: 1, refs: ['p13.pl1.b1'] }, currentEmail: 'someone@else.com',
  changedSince: false, knownRefs: new Set(['p13.pl1.b1']),
  onReply: vi.fn().mockResolvedValue(undefined), onSetStatus: vi.fn(),
  onHide: vi.fn(), onDelete: vi.fn(), onJumpToBeat: vi.fn(),
  onApprove: vi.fn(), onEdit: vi.fn().mockResolvedValue(undefined),
}

it('renders the category chip (defaults to Other when absent) and the mapped label', () => {
  const { rerender } = render(<CommentThread thread={mkThread()} canModerate={false} {...base} />)
  expect(screen.getByText('Other')).toBeInTheDocument()
  rerender(<CommentThread thread={mkThread({ category: 'fact' })} canModerate={false} {...base} />)
  expect(screen.getByText('Fact')).toBeInTheDocument()
})

it('applies the status colour to the card left-accent', () => {
  const { container } = render(
    <CommentThread thread={mkThread({ status: 'resolved' })} canModerate={false} {...base} />,
  )
  const card = container.firstElementChild as HTMLElement
  // STATUS_COLOR.resolved.hex = #3ea869 → rgb(62, 168, 105)
  expect(card.style.borderLeftColor).toBe('rgb(62, 168, 105)')
})

it('renders root, reply, and anchor jump-chip', () => {
  render(<CommentThread thread={mkThread()} canModerate={false} {...base} />)
  expect(screen.getByText('Check this date.')).toBeInTheDocument()
  expect(screen.getByText('Fixed.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /P13/ }))
  expect(base.onJumpToBeat).toHaveBeenCalledWith('p13.pl1.b1')
})

it('a moderator (admin or sub_admin) sees status control that calls onSetStatus', () => {
  const onSetStatus = vi.fn()
  render(<CommentThread thread={mkThread()} canModerate {...base} onSetStatus={onSetStatus} />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'resolved' } })
  expect(onSetStatus).toHaveBeenCalledWith('resolved')
})

it('non-moderator non-author sees no status control or delete', () => {
  render(<CommentThread thread={mkThread()} canModerate={false} {...base} />)
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
})

it('shows changed-since flag when set', () => {
  render(<CommentThread thread={mkThread()} canModerate={false} {...base} changedSince />)
  expect(screen.getByText(/changed since/i)).toBeInTheDocument()
})

it('renders an orphaned anchor with its snapshot when ref is unknown', () => {
  render(<CommentThread thread={mkThread()} canModerate={false} {...base} knownRefs={new Set()} />)
  expect(screen.getByText(/no longer exists/i)).toBeInTheDocument()
  expect(screen.getByText(/old text/)).toBeInTheDocument()
})

it('labels a page anchor by its kind', () => {
  const thread = mkThread({ anchors: [{ kind: 'page', ref: 'p13', page: 13, snapshot: 'Page 13' }] })
  render(
    <CommentThread
      thread={thread}
      canModerate={false}
      {...base}
      knownRefs={new Set(['p13'])}
    />,
  )
  expect(screen.getByRole('button', { name: /Page 13/ })).toBeInTheDocument()
})

it('shows the Draft pill when published is false and not when published is true', () => {
  const { rerender } = render(
    <CommentThread thread={mkThread({ published: false })} canModerate {...base} />,
  )
  expect(screen.getByText('Draft')).toBeInTheDocument()
  rerender(<CommentThread thread={mkThread({ published: true })} canModerate {...base} />)
  expect(screen.queryByText('Draft')).toBeNull()
})

it('shows the Approve button only for a moderator on a draft, and calls onApprove', () => {
  const onApprove = vi.fn()
  // Non-moderator never sees Approve.
  const { rerender } = render(
    <CommentThread thread={mkThread({ published: false })} canModerate={false} {...base} onApprove={onApprove} />,
  )
  expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
  // Moderator on a draft sees + can click Approve.
  rerender(<CommentThread thread={mkThread({ published: false })} canModerate {...base} onApprove={onApprove} />)
  const approve = screen.getByRole('button', { name: /approve/i })
  fireEvent.click(approve)
  expect(onApprove).toHaveBeenCalledTimes(1)
  // Once published, Approve is gone.
  rerender(<CommentThread thread={mkThread({ published: true })} canModerate {...base} onApprove={onApprove} />)
  expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
})

it('Edit (moderator) opens a textarea and Save calls onEdit with the edited text', async () => {
  const onEdit = vi.fn().mockResolvedValue(undefined)
  render(<CommentThread thread={mkThread()} canModerate {...base} onEdit={onEdit} />)
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
  const textarea = screen.getByRole('textbox')
  expect((textarea as HTMLTextAreaElement).value).toBe('Check this date.')
  fireEvent.change(textarea, { target: { value: 'Corrected date.' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(onEdit).toHaveBeenCalledWith('Corrected date.'))
})

it('Edit shows for the author (non-moderator) and not for a stranger', () => {
  // Author can edit their own comment.
  const { rerender } = render(
    <CommentThread thread={mkThread()} canModerate={false} {...base} currentEmail="ankit@x.com" />,
  )
  expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
  // A stranger sees no Edit.
  rerender(<CommentThread thread={mkThread()} canModerate={false} {...base} currentEmail="other@x.com" />)
  expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
})

it('labels a panel anchor by its kind', () => {
  const thread = mkThread({ anchors: [{ kind: 'panel', ref: 'p13.pl1', page: 13, panel: 1, snapshot: 'Panel 1' }] })
  render(
    <CommentThread
      thread={thread}
      canModerate={false}
      {...base}
      knownRefs={new Set(['p13.pl1'])}
    />,
  )
  expect(screen.getByRole('button', { name: /Panel 1/ })).toBeInTheDocument()
})

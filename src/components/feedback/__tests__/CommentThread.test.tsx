import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommentThread } from '@/components/feedback/CommentThread'
import type { Thread } from '@/lib/feedbackTypes'

const mkThread = (over: Partial<Thread['root']> = {}): Thread => ({
  root: {
    id: 'r1', comicId: 'c', line: 'biographies', parentId: null,
    anchors: [{ beatRef: 'p13.pl1.b1', page: 13, panel: 1, snapshot: 'old text' }],
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
}

it('renders root, reply, and anchor jump-chip', () => {
  render(<CommentThread thread={mkThread()} isAdmin={false} {...base} />)
  expect(screen.getByText('Check this date.')).toBeInTheDocument()
  expect(screen.getByText('Fixed.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /P13/ }))
  expect(base.onJumpToBeat).toHaveBeenCalledWith('p13.pl1.b1')
})

it('admin sees status control that calls onSetStatus', () => {
  const onSetStatus = vi.fn()
  render(<CommentThread thread={mkThread()} isAdmin {...base} onSetStatus={onSetStatus} />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'resolved' } })
  expect(onSetStatus).toHaveBeenCalledWith('resolved')
})

it('non-admin non-author sees no status control or delete', () => {
  render(<CommentThread thread={mkThread()} isAdmin={false} {...base} />)
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
})

it('shows changed-since flag when set', () => {
  render(<CommentThread thread={mkThread()} isAdmin={false} {...base} changedSince />)
  expect(screen.getByText(/changed since/i)).toBeInTheDocument()
})

it('renders an orphaned anchor with its snapshot when ref is unknown', () => {
  render(<CommentThread thread={mkThread()} isAdmin={false} {...base} knownRefs={new Set()} />)
  expect(screen.getByText(/no longer exists/i)).toBeInTheDocument()
  expect(screen.getByText(/old text/)).toBeInTheDocument()
})

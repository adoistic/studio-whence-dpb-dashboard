import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Thread } from '@/lib/feedbackTypes'

const anchored: Thread = {
  root: {
    id: 't1',
    comicId: 'c',
    line: 'biographies',
    parentId: null,
    anchors: [{ kind: 'beat', ref: 'p13.pl1.b1', page: 13, panel: 1, snapshot: 'Zindagi jiyo.' }],
    authorEmail: 'a@x.com',
    authorName: 'A',
    authorRole: 'allow',
    body: 'Anchored note',
    status: 'open',
    category: 'fact',
    comicVersion: 1,
    hidden: false,
    createdAt: '2026-06-03',
  },
  replies: [],
}

const general: Thread = {
  root: {
    id: 'g1',
    comicId: 'c',
    line: 'biographies',
    parentId: null,
    anchors: [],
    authorEmail: 'a@x.com',
    authorName: 'A',
    authorRole: 'allow',
    body: 'General note',
    status: 'open',
    category: 'tone',
    comicVersion: 1,
    hidden: false,
    createdAt: '2026-06-02',
  },
  replies: [],
}

const resolved: Thread = {
  root: { ...general.root, id: 'r1', body: 'Resolved note', status: 'resolved' },
  replies: [],
}

let threadData: Thread[] = []

vi.mock('@/lib/feedback', () => ({
  useComicFeedback: () => ({ data: threadData, loading: false }),
  addReply: vi.fn().mockResolvedValue(undefined),
  setStatus: vi.fn(),
  hideComment: vi.fn(),
  deleteComment: vi.fn(),
}))

vi.mock('@/lib/useComicVersions', () => ({
  useComicVersions: () => ({ data: [], loading: false }),
}))

vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: { email: 'me@x.com', displayName: 'Me' }, loading: false }),
  useAllowStatus: () => 'allow',
}))

import { CommentsView } from '@/components/feedback/CommentsView'

const onJumpInDraft = vi.fn()

// The draft html carries the anchored beat ref so it counts as a "live" anchor
// (CommentThread renders its anchor button) and so refOrder can position it.
const props = {
  comicId: 'biographies__c',
  line: 'biographies',
  comicVersion: 1,
  draftText: '<p data-beat-ref="p13.pl1.b1">Zindagi jiyo.</p>',
  onJumpInDraft,
}

beforeEach(() => {
  threadData = []
  onJumpInDraft.mockClear()
})

describe('CommentsView', () => {
  it('shows an anchored thread with its anchorLabel + quoted snapshot', () => {
    threadData = [anchored]
    render(<CommentsView {...props} />)
    // anchorLabel for a beat: "P13·1" (kind beat → `P${page}·${panel}`).
    // The context header renders it as a plain-text jump button.
    expect(screen.getByRole('button', { name: 'P13·1' })).toBeInTheDocument()
    // The quoted snapshot appears as a context blockquote.
    expect(screen.getByText('Zindagi jiyo.', { selector: 'blockquote' })).toBeInTheDocument()
    expect(screen.getByText('Anchored note')).toBeInTheDocument()
  })

  it('labels a general thread "Whole comic"', () => {
    threadData = [general]
    render(<CommentsView {...props} />)
    expect(screen.getByText(/whole comic/i)).toBeInTheDocument()
    expect(screen.getByText('General note')).toBeInTheDocument()
  })

  it('default filter hides resolved threads; toggling Resolved reveals them', () => {
    threadData = [general, resolved]
    render(<CommentsView {...props} />)
    expect(screen.getByText('General note')).toBeInTheDocument()
    expect(screen.queryByText('Resolved note')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^resolved$/i }))
    expect(screen.getByText('Resolved note')).toBeInTheDocument()
  })

  it('clicking an anchor context label jumps in the draft', () => {
    threadData = [anchored]
    render(<CommentsView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'P13·1' }))
    expect(onJumpInDraft).toHaveBeenCalledWith('p13.pl1.b1')
  })

  it('renders an empty state when there are no comments', () => {
    threadData = []
    render(<CommentsView {...props} />)
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument()
  })
})

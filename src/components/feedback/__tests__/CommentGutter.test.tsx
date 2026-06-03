import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { Anchor, Thread } from '@/lib/feedbackTypes'

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
    comicVersion: 1,
    hidden: false,
    createdAt: '2026-06-03',
  },
  replies: [],
}

const anchored: Thread = {
  root: {
    id: 't1',
    comicId: 'c',
    line: 'biographies',
    parentId: null,
    anchors: [{ kind: 'beat', ref: 'p13.pl1.b1', page: 13, panel: 1, snapshot: 's' }],
    authorEmail: 'a@x.com',
    authorName: 'A',
    authorRole: 'allow',
    body: 'Anchored note',
    status: 'open',
    comicVersion: 1,
    hidden: false,
    createdAt: '2026-06-03',
  },
  replies: [],
}

const hidden: Thread = {
  root: { ...general.root, id: 'h1', body: 'Hidden note', hidden: true },
  replies: [],
}

let threadData: Thread[] = []

const addComment = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/feedback', () => ({
  useComicFeedback: () => ({ data: threadData, loading: false }),
  addComment: (...args: unknown[]) => addComment(...args),
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

// Capture the hook's options so the test can drive selection programmatically.
let lastToggle: ((a: Anchor) => void) | null = null
vi.mock('@/components/feedback/useCommentTargets', () => ({
  useCommentTargets: (
    _ref: unknown,
    _threads: unknown,
    _draft: unknown,
    opts: { onToggleSelect: (a: Anchor) => void },
  ) => {
    lastToggle = opts.onToggleSelect
  },
}))

vi.mock('@/components/feedback/anchorRef', () => ({
  indexUnits: () => new Map(),
}))

import { CommentGutter } from '@/components/feedback/CommentGutter'

const props = {
  comicId: 'biographies__c',
  line: 'biographies',
  comicVersion: 1,
  scriptRef: { current: null },
  draftText: '<p></p>',
}

beforeEach(() => {
  threadData = []
  lastToggle = null
  addComment.mockClear()
})

describe('CommentGutter', () => {
  it('renders general + anchored threads; anchored shows badge number', () => {
    threadData = [anchored, general]
    render(<CommentGutter {...props} />)
    expect(screen.getByText('Anchored note')).toBeInTheDocument()
    expect(screen.getByText('General note')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('hides hidden threads from non-admins', () => {
    threadData = [hidden]
    render(<CommentGutter {...props} />)
    expect(screen.queryByText('Hidden note')).toBeNull()
  })

  it('General comment button opens the composer', () => {
    render(<CommentGutter {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /general comment/i }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('selecting units shows the selection bar and composes one comment with the selected anchors', async () => {
    render(<CommentGutter {...props} />)
    expect(screen.queryByText(/selected/)).toBeNull()

    const a: Anchor = { kind: 'page', ref: 'p1', page: 1, snapshot: 'Page 1' }
    const b: Anchor = { kind: 'beat', ref: 'p2.pl1.b1', page: 2, panel: 1, snapshot: 'hi' }
    act(() => {
      lastToggle!(a)
      lastToggle!(b)
    })

    // Selection bar reports the count + offers Comment + Clear.
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^comment$/i }))

    // Composer opens with both selected anchors as chips.
    expect(screen.getByRole('textbox')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'fix these' } })
    fireEvent.click(screen.getByRole('button', { name: /post/i }))

    await vi.waitFor(() => expect(addComment).toHaveBeenCalled())
    const [payload] = addComment.mock.calls[0]
    expect(payload.anchors).toEqual([a, b])
    expect(payload.body).toBe('fix these')

    // Posting clears the selection bar.
    await vi.waitFor(() => expect(screen.queryByText('2 selected')).toBeNull())
  })

  it('toggling the same unit twice removes it (dedupe by ref)', () => {
    render(<CommentGutter {...props} />)
    const a: Anchor = { kind: 'page', ref: 'p1', page: 1, snapshot: 'Page 1' }
    act(() => lastToggle!(a))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    act(() => lastToggle!(a))
    expect(screen.queryByText(/selected/)).toBeNull()
  })

  it('Clear empties the selection', () => {
    render(<CommentGutter {...props} />)
    const a: Anchor = { kind: 'panel', ref: 'p1.pl1', page: 1, panel: 1, snapshot: 'Panel 1' }
    act(() => lastToggle!(a))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.queryByText(/selected/)).toBeNull()
  })
})

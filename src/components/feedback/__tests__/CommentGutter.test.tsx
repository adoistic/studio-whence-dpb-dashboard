import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Thread } from '@/lib/feedbackTypes'

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
    anchors: [{ beatRef: 'p13.pl1.b1', page: 13, panel: 1, snapshot: 's' }],
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

vi.mock('@/lib/feedback', () => ({
  useComicFeedback: () => ({ data: threadData, loading: false }),
  addComment: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/components/feedback/useBeatMarkers', () => ({
  useBeatMarkers: () => {},
  indexBeats: () => new Map(),
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
})

describe('CommentGutter', () => {
  it('renders general + anchored threads; anchored shows badge number', () => {
    threadData = [anchored, general]
    render(<CommentGutter {...props} />)
    expect(screen.getByText('Anchored note')).toBeInTheDocument()
    expect(screen.getByText('General note')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument() // badge number on the anchored thread
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
})

import { describe, it, expect } from 'vitest'
import { groupThreads, changedSince, visibleTo, type FeedbackNode } from '@/lib/feedbackTypes'

const node = (over: Partial<FeedbackNode>): FeedbackNode => ({
  id: 'x', comicId: 'c', line: 'biographies', parentId: null, anchors: [],
  authorEmail: 'a@b.com', authorName: 'A', authorRole: 'allow', body: 'b',
  status: 'open', comicVersion: 1, hidden: false, createdAt: '2026-06-01', ...over,
})

describe('groupThreads', () => {
  it('roots newest-first, replies chronological under their root', () => {
    const nodes = [
      node({ id: 'r1', createdAt: '2026-06-01' }),
      node({ id: 'r2', createdAt: '2026-06-03' }),
      node({ id: 'p2', parentId: 'r1', createdAt: '2026-06-02' }),
      node({ id: 'p1', parentId: 'r1', createdAt: '2026-06-01' }),
    ]
    const t = groupThreads(nodes)
    expect(t.map((x) => x.root.id)).toEqual(['r2', 'r1'])
    expect(t[1].replies.map((x) => x.id)).toEqual(['p1', 'p2'])
  })
})

describe('changedSince', () => {
  const versions = [{ version: 2, changedBeatRefs: ['p1.pl1.b1'] }, { version: 1, changedBeatRefs: [] }]
  it('true when an anchored beat changed in a later version', () => {
    const n = node({ comicVersion: 1, anchors: [{ beatRef: 'p1.pl1.b1', page: 1, panel: 1, snapshot: 's' }] })
    expect(changedSince(n, 2, versions)).toBe(true)
  })
  it('false for general comments or when nothing changed', () => {
    expect(changedSince(node({ comicVersion: 1, anchors: [] }), 2, versions)).toBe(false)
    const n = node({ comicVersion: 1, anchors: [{ beatRef: 'p9.pl9.b9', page: 9, panel: 9, snapshot: 's' }] })
    expect(changedSince(n, 2, versions)).toBe(false)
  })
  it('false when comment is already on the current version', () => {
    const n = node({ comicVersion: 2, anchors: [{ beatRef: 'p1.pl1.b1', page: 1, panel: 1, snapshot: 's' }] })
    expect(changedSince(n, 2, versions)).toBe(false)
  })
})

describe('visibleTo', () => {
  it('hides hidden comments from non-admins only', () => {
    expect(visibleTo(node({ hidden: true }), false)).toBe(false)
    expect(visibleTo(node({ hidden: true }), true)).toBe(true)
    expect(visibleTo(node({ hidden: false }), false)).toBe(true)
  })
})

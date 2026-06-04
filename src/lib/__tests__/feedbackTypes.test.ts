import { describe, it, expect } from 'vitest'
import {
  groupThreads, changedSince, visibleTo,
  CATEGORY_LABELS, CATEGORY_ORDER, STATUS_COLOR,
  type FeedbackNode, type Category, type Status,
} from '@/lib/feedbackTypes'

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
    const n = node({ comicVersion: 1, anchors: [{ kind: 'beat', ref: 'p1.pl1.b1', page: 1, panel: 1, snapshot: 's' }] })
    expect(changedSince(n, 2, versions)).toBe(true)
  })
  it('true for a panel anchor when a beat under it changed', () => {
    const n = node({ comicVersion: 1, anchors: [{ kind: 'panel', ref: 'p1.pl1', page: 1, panel: 1, snapshot: 'Panel 1' }] })
    expect(changedSince(n, 2, versions)).toBe(true)
  })
  it('true for a page anchor when a beat under it changed', () => {
    const n = node({ comicVersion: 1, anchors: [{ kind: 'page', ref: 'p1', page: 1, snapshot: 'Page 1' }] })
    expect(changedSince(n, 2, versions)).toBe(true)
  })
  it('false for a page anchor when only a different page changed (the "." separator guard)', () => {
    const v = [{ version: 2, changedBeatRefs: ['p13.pl1.b1'] }, { version: 1, changedBeatRefs: [] }]
    const n = node({ comicVersion: 1, anchors: [{ kind: 'page', ref: 'p1', page: 1, snapshot: 'Page 1' }] })
    expect(changedSince(n, 2, v)).toBe(false)
  })
  it('false for general comments or when nothing changed', () => {
    expect(changedSince(node({ comicVersion: 1, anchors: [] }), 2, versions)).toBe(false)
    const n = node({ comicVersion: 1, anchors: [{ kind: 'beat', ref: 'p9.pl9.b9', page: 9, panel: 9, snapshot: 's' }] })
    expect(changedSince(n, 2, versions)).toBe(false)
  })
  it('false when comment is already on the current version', () => {
    const n = node({ comicVersion: 2, anchors: [{ kind: 'beat', ref: 'p1.pl1.b1', page: 1, panel: 1, snapshot: 's' }] })
    expect(changedSince(n, 2, versions)).toBe(false)
  })
})

describe('Category taxonomy', () => {
  it('CATEGORY_ORDER and CATEGORY_LABELS cover the same 13 categories', () => {
    expect(CATEGORY_ORDER).toHaveLength(13)
    for (const c of CATEGORY_ORDER) expect(CATEGORY_LABELS[c]).toBeTruthy()
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...CATEGORY_ORDER].sort())
  })
  it('starts with fact and ends with other', () => {
    expect(CATEGORY_ORDER[0]).toBe<Category>('fact')
    expect(CATEGORY_ORDER.at(-1)).toBe<Category>('other')
  })
})

describe('STATUS_COLOR', () => {
  const statuses: Status[] = ['open', 'in_progress', 'resolved', 'deferred', 'wont_fix']
  it('has a distinct hex + label for every status', () => {
    const hexes = statuses.map((s) => STATUS_COLOR[s].hex)
    expect(new Set(hexes).size).toBe(statuses.length)
    for (const s of statuses) {
      expect(STATUS_COLOR[s].hex).toMatch(/^#[0-9a-f]{6}$/i)
      expect(STATUS_COLOR[s].label).toBeTruthy()
    }
  })
})

describe('visibleTo', () => {
  it('hides hidden comments from non-admins only', () => {
    expect(visibleTo(node({ hidden: true }), false)).toBe(false)
    expect(visibleTo(node({ hidden: true }), true)).toBe(true)
    expect(visibleTo(node({ hidden: false }), false)).toBe(true)
  })
})

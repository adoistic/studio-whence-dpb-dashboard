import { describe, expect, it } from 'vitest'
import { readerPageNumber, pageAnchor, threadsForPage, countThreadsByPage } from '@/lib/readerPages'
import type { Thread, FeedbackNode, Anchor } from '@/lib/feedbackTypes'

function node(anchors: Anchor[], id = 'x'): FeedbackNode {
  return {
    id, comicId: 'tingaland__01', line: 'tingaland', parentId: null, anchors,
    authorEmail: 'a@b.c', authorName: 'A', authorRole: 'allow', body: 'hi',
    comicVersion: 0, hidden: false, published: true, createdAt: 0,
  }
}
const thread = (anchors: Anchor[], id = 'x'): Thread => ({ root: node(anchors, id), replies: [] })

describe('readerPageNumber', () => {
  it('maps frames with a cover: frame 0 is the cover, frame N is page N', () => {
    expect(readerPageNumber(true, 0)).toBeNull()
    expect(readerPageNumber(true, 1)).toBe(1)
    expect(readerPageNumber(true, 56)).toBe(56)
  })
  it('maps frames without a cover: frame i is page i+1', () => {
    expect(readerPageNumber(false, 0)).toBe(1)
    expect(readerPageNumber(false, 11)).toBe(12)
  })
})

describe('pageAnchor', () => {
  it('builds the canonical page anchor (same ref space as the draft view)', () => {
    expect(pageAnchor(13)).toEqual({ kind: 'page', ref: 'p13', page: 13, snapshot: 'Page 13' })
  })
})

describe('threadsForPage / countThreadsByPage', () => {
  const pa = (p: number): Anchor => ({ kind: 'page', ref: `p${p}`, page: p, snapshot: `Page ${p}` })
  const ba = (p: number): Anchor => ({ kind: 'beat', ref: `p${p}.pl1.b1`, page: p, panel: 1, snapshot: 'beat' })

  it('matches a page via ANY anchor kind, and never double-counts a thread', () => {
    const t1 = thread([pa(3)], 't1')                 // page anchor on p3
    const t2 = thread([ba(3), ba(3)], 't2')          // two beat anchors, both p3
    const t3 = thread([pa(4)], 't3')                 // other page
    const t4 = thread([], 't4')                      // general comment
    expect(threadsForPage([t1, t2, t3, t4], 3).map((t) => t.root.id)).toEqual(['t1', 't2'])
    const counts = countThreadsByPage([t1, t2, t3, t4])
    expect(counts.get(3)).toBe(2)
    expect(counts.get(4)).toBe(1)
    expect(counts.has(5)).toBe(false)
  })

  it('counts a multi-page thread once per page it touches', () => {
    const t = thread([pa(2), ba(5)], 'multi')
    const counts = countThreadsByPage([t])
    expect(counts.get(2)).toBe(1)
    expect(counts.get(5)).toBe(1)
  })
})

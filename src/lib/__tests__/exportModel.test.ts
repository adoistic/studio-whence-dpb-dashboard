import { describe, it, expect } from 'vitest'
import { buildExportModel, type ExportOptions } from '@/lib/exportModel'
import type { Thread, FeedbackNode, Anchor } from '@/lib/feedbackTypes'
import type { Comic } from '@/types/content'

const OPTS: ExportOptions = { includeComments: true, includeScript: true, includeResolved: false }

function comic(pages: number, cover = true): Comic {
  return {
    title: 'Test Comic', line: 'biographies', slug: 'test-comic', status: 'approved',
    subject_slug: null,
    pages: { hasPages: true, count: pages, coverKey: cover ? 'images/comics/biographies/test-comic/cover.jpg' : undefined },
  } as unknown as Comic
}

let seq = 0
function node(over: Partial<FeedbackNode>): FeedbackNode {
  return {
    id: `n${++seq}`, comicId: 'biographies__test-comic', line: 'biographies', parentId: null,
    anchors: [], authorEmail: 'r@x.com', authorName: 'Reviewer', authorRole: 'editor',
    body: 'Fix the hat colour', comicVersion: 1, hidden: false, published: true,
    createdAt: '2026-08-01T10:00:00.000Z',
    ...over,
  }
}
const pageAnchor = (p: number): Anchor => ({ kind: 'page', ref: `p${p}`, page: p, snapshot: `Page ${p}` })
const beatAnchor = (p: number): Anchor => ({ kind: 'beat', ref: `p${p}.pl1.b1`, page: p, panel: 1, snapshot: 'PANEL TEXT' })
const thread = (root: FeedbackNode, replies: FeedbackNode[] = []): Thread => ({ root, replies })

describe('buildExportModel', () => {
  it('builds one page unit per published page with zip-relative image refs and cover', () => {
    const m = buildExportModel({ comic: comic(3), threads: [], draftPages: null, options: OPTS })
    expect(m.cover).toEqual({ image: 'cover.jpg' })
    expect(m.pages.map((p) => p.page)).toEqual([1, 2, 3])
    expect(m.pages[0].image).toBe('pages/page-01.jpg')
    expect(m.hasScript).toBe(false)
    expect(m.pages.every((p) => p.script === null)).toBe(true)
  })

  it('files threads under every page an anchor touches, with alsoOnPages', () => {
    const t = thread(node({ anchors: [pageAnchor(1), pageAnchor(3)] }))
    const m = buildExportModel({ comic: comic(3), threads: [t], draftPages: null, options: OPTS })
    expect(m.pages[0].comments).toHaveLength(1)
    expect(m.pages[2].comments).toHaveLength(1)
    expect(m.pages[1].comments).toHaveLength(0)
    expect(m.pages[0].comments[0].alsoOnPages).toEqual([3])
    expect(m.pages[2].comments[0].alsoOnPages).toEqual([1])
  })

  it('keeps beat-anchor label + snapshot so comment-only exports read in context', () => {
    const t = thread(node({ anchors: [beatAnchor(2)] }))
    const m = buildExportModel({ comic: comic(3), threads: [t], draftPages: null, options: OPTS })
    const c = m.pages[1].comments[0]
    expect(c.anchor).toEqual({ kind: 'beat', label: 'P2·1', snapshot: 'PANEL TEXT' })
  })

  it('unanchored threads go to generalComments', () => {
    const m = buildExportModel({ comic: comic(2), threads: [thread(node({}))], draftPages: null, options: OPTS })
    expect(m.generalComments).toHaveLength(1)
    expect(m.pages.every((p) => p.comments.length === 0)).toBe(true)
  })

  it('drops resolved and wont_fix roots when includeResolved=false, keeps them when true', () => {
    const ts = [
      thread(node({ anchors: [pageAnchor(1)], status: 'resolved' })),
      thread(node({ anchors: [pageAnchor(1)], status: 'wont_fix' })),
      thread(node({ anchors: [pageAnchor(1)], status: 'open' })),
      thread(node({ anchors: [pageAnchor(1)] })), // no status → treated open, kept
    ]
    const off = buildExportModel({ comic: comic(1), threads: ts, draftPages: null, options: OPTS })
    expect(off.pages[0].comments).toHaveLength(2)
    const on = buildExportModel({ comic: comic(1), threads: ts, draftPages: null, options: { ...OPTS, includeResolved: true } })
    expect(on.pages[0].comments).toHaveLength(4)
  })

  it('includeComments=false empties all comment arrays but keeps structure', () => {
    const ts = [thread(node({ anchors: [pageAnchor(1)] })), thread(node({}))]
    const m = buildExportModel({ comic: comic(1), threads: ts, draftPages: null, options: { ...OPTS, includeComments: false } })
    expect(m.pages[0].comments).toEqual([])
    expect(m.generalComments).toEqual([])
  })

  it('attaches script pages by number and honours includeScript=false', () => {
    const draft = [{ number: '1', panels: [] }, { number: '2', panels: [] }]
    const on = buildExportModel({ comic: comic(2), threads: [], draftPages: draft, options: OPTS })
    expect(on.hasScript).toBe(true)
    expect(on.pages[0].script).toEqual(draft[0])
    const off = buildExportModel({ comic: comic(2), threads: [], draftPages: draft, options: { ...OPTS, includeScript: false } })
    expect(off.hasScript).toBe(true)
    expect(off.pages[0].script).toBeNull()
  })

  it('a comment above the page count creates a trailing orphan page with image: null', () => {
    const t = thread(node({ anchors: [pageAnchor(9)] }))
    const m = buildExportModel({ comic: comic(2), threads: [t], draftPages: null, options: OPTS })
    expect(m.pages.map((p) => p.page)).toEqual([1, 2, 9])
    expect(m.pages[2].image).toBeNull()
    expect(m.pages[2].comments).toHaveLength(1)
  })

  it('replies are chronological with author + ISO createdAt', () => {
    const root = node({ anchors: [pageAnchor(1)] })
    const r1 = node({ parentId: root.id, body: 'Reply one', createdAt: '2026-08-02T10:00:00.000Z', authorName: 'Adnan', authorRole: 'admin' })
    const m = buildExportModel({ comic: comic(1), threads: [thread(root, [r1])], draftPages: null, options: OPTS })
    expect(m.pages[0].comments[0].replies).toEqual([
      { author: 'Adnan', role: 'admin', body: 'Reply one', createdAt: '2026-08-02T10:00:00.000Z' },
    ])
  })
})

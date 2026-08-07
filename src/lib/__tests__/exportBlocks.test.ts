import { describe, it, expect } from 'vitest'
import { authorDocBlocks, sideBySideDocBlocks, threadBlocks, type Block } from '@/lib/exportBlocks'
import { buildExportModel, type ExportOptions, type ExportThread } from '@/lib/exportModel'
import type { Thread, FeedbackNode } from '@/lib/feedbackTypes'
import type { Comic } from '@/types/content'

const OPTS: ExportOptions = { includeComments: true, includeScript: true, includeResolved: false }
const comic = {
  title: 'Test Comic', line: 'biographies', slug: 'test-comic', status: 'approved', subject_slug: null,
  pages: { hasPages: true, count: 2, coverKey: 'images/comics/biographies/test-comic/cover.jpg' },
} as unknown as Comic

function node(over: Partial<FeedbackNode>): FeedbackNode {
  return {
    id: 'r1', comicId: 'x', line: 'biographies', parentId: null, anchors: [],
    authorEmail: 'r@x.com', authorName: 'Reviewer', authorRole: 'editor',
    body: 'Fix the hat colour', comicVersion: 1, hidden: false, published: true,
    createdAt: '2026-08-01T10:00:00.000Z', status: 'open', category: 'art', ...over,
  }
}
const threads: Thread[] = [{
  root: node({ anchors: [{ kind: 'page', ref: 'p1', page: 1, snapshot: 'Page 1' }] }),
  replies: [node({ id: 'r2', parentId: 'r1', body: 'Done', authorName: 'Adnan', authorRole: 'admin' })],
}]
const draft = [
  { number: '1', panels: [{ number: '1', art: 'A hat, red.', beats: [{ kind: 'dialogue' as const, name: 'RAMU', text: 'HELLO' }] }] },
  { number: '2', panels: [] },
]

const texts = (bs: Block[]) => bs.map((b) => ('text' in b ? b.text : b.kind)).join('|')

describe('authorDocBlocks', () => {
  it('emits the fixed label grammar: COVER, PAGE N, COMMENTS, SCRIPT, GENERAL COMMENTS', () => {
    const withGeneral = [...threads, { root: node({ id: 'g1', anchors: [] }), replies: [] }]
    const m = buildExportModel({ comic, threads: withGeneral, draftPages: draft, options: OPTS })
    const t = texts(authorDocBlocks(m))
    expect(t).toContain('COVER')
    expect(t).toContain('PAGE 1')
    expect(t).toContain('PAGE 2')
    expect(t).toContain('COMMENTS')
    expect(t).toContain('SCRIPT')
    expect(t).toContain('GENERAL COMMENTS')
  })

  it('page with no comments prints the stable "No comments." marker', () => {
    const m = buildExportModel({ comic, threads: [], draftPages: null, options: OPTS })
    const flat = authorDocBlocks(m)
    const line = flat.find((b) => b.kind === 'line' && b.runs.some((r) => r.text === 'No comments.'))
    expect(line).toBeTruthy()
  })

  it('orphan pages are headed "PAGE N (no image published)" and carry no image block', () => {
    const t: Thread[] = [{ root: node({ anchors: [{ kind: 'page', ref: 'p9', page: 9, snapshot: 'Page 9' }] }), replies: [] }]
    const m = buildExportModel({ comic, threads: t, draftPages: null, options: OPTS })
    const bs = authorDocBlocks(m)
    const h = bs.findIndex((b) => b.kind === 'h1' && b.text === 'PAGE 9 (no image published)')
    expect(h).toBeGreaterThan(-1)
    expect(bs.slice(h + 1).find((b) => b.kind === 'image')).toBeUndefined()
  })

  it('script beats render as speaker-prefixed lines', () => {
    const m = buildExportModel({ comic, threads: [], draftPages: draft, options: OPTS })
    const lines = authorDocBlocks(m).filter((b): b is Extract<Block, { kind: 'line' }> => b.kind === 'line')
    expect(lines.some((l) => l.runs.map((r) => r.text).join('').includes('RAMU: HELLO'))).toBe(true)
    expect(lines.some((l) => l.runs.map((r) => r.text).join('').includes('A hat, red.'))).toBe(true)
  })
})

describe('threadBlocks', () => {
  const et: ExportThread = {
    id: 'r1', status: 'open', category: 'art', author: 'Reviewer', role: 'editor',
    body: 'Fix the hat colour', createdAt: '2026-08-01T10:00:00.000Z',
    anchor: { kind: 'beat', label: 'P1·1', snapshot: 'PANEL TEXT' }, alsoOnPages: [3],
    replies: [{ author: 'Adnan', role: 'admin', body: 'Done', createdAt: null }],
  }
  it('renders header, body, anchor context, cross-page note and indented reply', () => {
    const bs = threadBlocks(et)
    const all = bs.map((b) => (b.kind === 'line' ? b.runs.map((r) => r.text).join('') : '')).join('\n')
    expect(all).toContain('[Open · Art direction] Reviewer (editor)')
    expect(all).toContain('Fix the hat colour')
    expect(all).toContain('re: P1·1 — “PANEL TEXT”')
    expect(all).toContain('also on page 3')
    expect(all).toContain('↳ Adnan (admin): Done')
    const reply = bs.find((b) => b.kind === 'line' && b.indent)
    expect(reply).toBeTruthy()
  })
})

describe('sideBySideDocBlocks', () => {
  it('one row per page: image ref left, content right', () => {
    const m = buildExportModel({ comic, threads, draftPages: draft, options: OPTS })
    const rows = sideBySideDocBlocks(m).filter((b): b is Extract<Block, { kind: 'row' }> => b.kind === 'row')
    // cover row + 2 page rows
    expect(rows).toHaveLength(3)
    expect(rows[1].left[0]).toEqual({ kind: 'image', ref: 1 })
    expect(texts(rows[1].right)).toContain('COMMENTS')
  })
})

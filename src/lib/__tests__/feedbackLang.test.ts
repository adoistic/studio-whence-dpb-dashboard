import { describe, test, expect } from 'vitest'
import {
  nodeLang, appliesToLanguage, isForeign, displayAnchors,
  type FeedbackNode,
} from '@/lib/feedbackTypes'

function node(over: Partial<FeedbackNode> = {}): FeedbackNode {
  return {
    id: 'x', comicId: 'legacy__rajyog', line: 'legacy', parentId: null,
    anchors: [], authorEmail: 'a@b.c', authorName: 'A', authorRole: 'allow',
    body: 'hi', comicVersion: 1, hidden: false, createdAt: 0, ...over,
  }
}

const BEAT = { kind: 'beat' as const, ref: 'p12.pl1.b2', page: 12, panel: 1, snapshot: 'A line' }
const BOX = { kind: 'box' as const, ref: 'p12.b3', page: 12, box: 3, snapshot: 'Ek baat' }

describe('comment language', () => {
  test('a legacy comment with no lang field counts as the comic original', () => {
    expect(nodeLang(node(), 'hi')).toBe('hi')
    expect(nodeLang(node({ lang: 'en' }), 'hi')).toBe('en')
  })

  test('a single-language comment applies only to its own language', () => {
    const n = node({ lang: 'hi', langScope: 'hi' })
    expect(appliesToLanguage(n, 'hi', 'hi')).toBe(true)
    expect(appliesToLanguage(n, 'en', 'hi')).toBe(false)
  })

  test('an all-languages comment applies everywhere', () => {
    const n = node({ lang: 'en', langScope: 'all' })
    expect(appliesToLanguage(n, 'hi', 'hi')).toBe(true)
    expect(appliesToLanguage(n, 'en', 'hi')).toBe(true)
  })

  test('a legacy comment applies to the original language only', () => {
    expect(appliesToLanguage(node(), 'hi', 'hi')).toBe(true)
    expect(appliesToLanguage(node(), 'en', 'hi')).toBe(false)
  })

  test('isForeign marks a shared comment being read outside its home language', () => {
    const n = node({ lang: 'en', langScope: 'all' })
    expect(isForeign(n, 'hi', 'hi')).toBe(true)
    expect(isForeign(n, 'en', 'hi')).toBe(false)
  })

  test('at home, a precise anchor is untouched', () => {
    const n = node({ lang: 'en', langScope: 'all', anchors: [BEAT] })
    expect(displayAnchors(n, 'en', 'hi')).toEqual([BEAT])
  })

  test('away, a beat anchor shows as its page — and the stored anchor is not mutated', () => {
    const n = node({ lang: 'en', langScope: 'all', anchors: [BEAT] })
    expect(displayAnchors(n, 'hi', 'hi')).toEqual([
      { kind: 'page', ref: 'p12', page: 12, snapshot: 'Page 12' },
    ])
    expect(n.anchors[0]).toEqual(BEAT) // unchanged
  })

  test('away, a box anchor also shows as its page — the rule is symmetric', () => {
    const n = node({ lang: 'hi', langScope: 'all', anchors: [BOX] })
    expect(displayAnchors(n, 'en', 'hi')).toEqual([
      { kind: 'page', ref: 'p12', page: 12, snapshot: 'Page 12' },
    ])
  })

  test('away, duplicate pages collapse to one chip', () => {
    const n = node({
      lang: 'en', langScope: 'all',
      anchors: [BEAT, { kind: 'beat', ref: 'p12.pl2.b1', page: 12, panel: 2, snapshot: 'B' }],
    })
    expect(displayAnchors(n, 'hi', 'hi')).toHaveLength(1)
  })

  test('a general comment with no anchors stays anchor-less everywhere', () => {
    const n = node({ lang: 'en', langScope: 'all' })
    expect(displayAnchors(n, 'hi', 'hi')).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { buildCitationMap, sliceExcerpt } from '@/lib/provenance'

const content = {
  lines: [
    { figures: [
      { slug: 'steve-jobs', sources: [
        { slug: 'isaacson', title: 'Walter Isaacson, Steve Jobs', kind: 'book',
          files: [{ path: 'biographies/02/_books/steve-jobs/isaacson/ch/18.md', title: 'Chapter 12' }] },
      ] },
    ] },
  ],
} as any

describe('buildCitationMap', () => {
  it('maps a file path to its source + file title', () => {
    const m = buildCitationMap(content)
    expect(m.get('biographies/02/_books/steve-jobs/isaacson/ch/18.md')).toEqual({
      sourceTitle: 'Walter Isaacson, Steve Jobs', fileTitle: 'Chapter 12',
    })
  })
  it('returns an empty map for null content', () => {
    expect(buildCitationMap(null).size).toBe(0)
  })
})

describe('sliceExcerpt', () => {
  const text = 'a\nb\nc\nd\ne'
  it('returns ±ctx lines with the cited index (middle)', () => {
    expect(sliceExcerpt(text, 3, 2)).toEqual({ lines: ['a', 'b', 'c', 'd', 'e'], citedIndex: 2 })
  })
  it('clamps at the start', () => {
    expect(sliceExcerpt(text, 1, 2)).toEqual({ lines: ['a', 'b', 'c'], citedIndex: 0 })
  })
  it('clamps at the end', () => {
    expect(sliceExcerpt(text, 5, 2)).toEqual({ lines: ['c', 'd', 'e'], citedIndex: 2 })
  })
  it('out-of-bounds line → citedIndex -1, slice near end', () => {
    const r = sliceExcerpt(text, 99, 2)
    expect(r.citedIndex).toBe(-1)
    expect(r.lines.length).toBeGreaterThan(0)
  })
})

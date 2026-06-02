import { describe, it, expect } from 'vitest'
import { buildCitationMap, excerptPassage } from '@/lib/provenance'

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

describe('excerptPassage', () => {
  it('returns the cited paragraph only (not a multi-line window)', () => {
    expect(excerptPassage('para before\nThe cited paragraph\npara after', 2)).toBe('The cited paragraph')
  })
  it('unescapes markdown-escaped punctuation', () => {
    expect(excerptPassage('x\n\\(Engineer rose\\) to be chief\ny', 2)).toBe('(Engineer rose) to be chief')
  })
  it('strips a leading blockquote/heading marker', () => {
    expect(excerptPassage('x\n> quoted line\ny', 2)).toBe('quoted line')
  })
  it('truncates a long paragraph on a word boundary with ellipsis', () => {
    const long = ('word '.repeat(100)).trim()
    const out = excerptPassage('a\n' + long + '\nb', 2, 40)
    expect(out.length).toBeLessThanOrEqual(41)
    expect(out.endsWith('…')).toBe(true)
  })
  it('falls back to the nearest non-blank line when the cited line is blank', () => {
    expect(excerptPassage('a\nreal text\n\n', 3)).toBe('real text')
  })
  it('returns empty string when nothing usable is near', () => {
    expect(excerptPassage('\n\n\n\n', 2)).toBe('')
  })
})

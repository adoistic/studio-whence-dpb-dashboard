import { describe, it, expect } from 'vitest'
import { parseAnchorRef, anchorFromUnit } from '@/components/feedback/anchorRef'

describe('parseAnchorRef', () => {
  it('parses a page ref', () => {
    expect(parseAnchorRef('p13')).toEqual({ kind: 'page', page: 13 })
  })
  it('parses a panel ref', () => {
    expect(parseAnchorRef('p13.pl1')).toEqual({ kind: 'panel', page: 13, panel: 1 })
  })
  it('parses a numbered beat ref', () => {
    expect(parseAnchorRef('p13.pl1.b2')).toEqual({ kind: 'beat', page: 13, panel: 1 })
  })
  it('parses an Art beat ref', () => {
    expect(parseAnchorRef('p13.pl2.art')).toEqual({ kind: 'beat', page: 13, panel: 2 })
  })
  it('returns null for a malformed ref', () => {
    for (const bad of ['', 'p', 'page13', 'p13.x', 'p13.pl1.x9', 'pl1.b2', 'p13.plx.b2', 'p1.pl1.b']) {
      expect(parseAnchorRef(bad)).toBeNull()
    }
  })
})

describe('anchorFromUnit', () => {
  it('builds a page anchor with a "Page N" snapshot', () => {
    const el = document.createElement('section')
    el.textContent = 'lots of page text'
    expect(anchorFromUnit('p7', el)).toEqual({ kind: 'page', ref: 'p7', page: 7, snapshot: 'Page 7' })
  })
  it('builds a panel anchor with a "Panel N" snapshot', () => {
    const el = document.createElement('div')
    expect(anchorFromUnit('p7.pl3', el)).toEqual({
      kind: 'panel',
      ref: 'p7.pl3',
      page: 7,
      panel: 3,
      snapshot: 'Panel 3',
    })
  })
  it('builds a beat anchor from the element text, collapsed + trimmed', () => {
    const el = document.createElement('p')
    el.textContent = '  Chanakya:   one  life  '
    expect(anchorFromUnit('p7.pl3.b1', el)).toEqual({
      kind: 'beat',
      ref: 'p7.pl3.b1',
      page: 7,
      panel: 3,
      snapshot: 'Chanakya: one life',
    })
  })
  it('excludes injected badge/toggle controls from a beat snapshot', () => {
    const el = document.createElement('p')
    el.innerHTML =
      '<button class="cs-beat-badge">3</button>real beat text<button class="cs-unit-select">＋Select</button>'
    expect(anchorFromUnit('p1.pl1.b1', el)?.snapshot).toBe('real beat text')
  })
  it('truncates a long beat snapshot', () => {
    const el = document.createElement('p')
    el.textContent = 'x'.repeat(300)
    const a = anchorFromUnit('p1.pl1.b1', el)!
    expect(a.snapshot.length).toBeLessThanOrEqual(140)
    expect(a.snapshot.endsWith('…')).toBe(true)
  })
  it('returns null for a malformed ref', () => {
    expect(anchorFromUnit('nope', document.createElement('p'))).toBeNull()
  })
})

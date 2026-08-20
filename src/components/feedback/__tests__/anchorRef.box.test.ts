import { describe, test, expect } from 'vitest'
import { parseAnchorRef, indexUnits, anchorFromUnit } from '@/components/feedback/anchorRef'
import { anchorLabel } from '@/lib/feedbackTypes'

describe('box anchors', () => {
  test('parses a box ref', () => {
    expect(parseAnchorRef('p12.b3')).toEqual({ kind: 'box', page: 12, box: 3 })
  })

  test('still parses every existing kind unchanged', () => {
    expect(parseAnchorRef('p13')).toEqual({ kind: 'page', page: 13 })
    expect(parseAnchorRef('p13.pl1')).toEqual({ kind: 'panel', page: 13, panel: 1 })
    expect(parseAnchorRef('p13.pl1.b2')).toEqual({ kind: 'beat', page: 13, panel: 1 })
    expect(parseAnchorRef('p13.pl1.art')).toEqual({ kind: 'beat', page: 13, panel: 1 })
  })

  test('rejects a malformed ref', () => {
    expect(parseAnchorRef('p12.b')).toBeNull()
    expect(parseAnchorRef('nonsense')).toBeNull()
  })

  test('indexUnits picks up data-box-ref', () => {
    const root = document.createElement('div')
    root.innerHTML = '<section data-page-ref="p1"><p data-box-ref="p1.b1">hi</p></section>'
    const m = indexUnits(root)
    expect(m.get('p1.b1')?.textContent).toBe('hi')
    expect(m.has('p1')).toBe(true)
  })

  test('anchorFromUnit snapshots a box by its text', () => {
    const el = document.createElement('p')
    el.textContent = 'Two rupees, grandfather?'
    const a = anchorFromUnit('p3.b2', el)
    expect(a).toEqual({
      kind: 'box', ref: 'p3.b2', page: 3, box: 2,
      snapshot: 'Two rupees, grandfather?',
    })
  })

  test('anchorLabel names a box by page and box number', () => {
    expect(anchorLabel({ kind: 'box', ref: 'p3.b2', page: 3, box: 2, snapshot: 'x' }))
      .toBe('Box 2 · p3')
  })
})

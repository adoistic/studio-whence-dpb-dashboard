/**
 * indesignTrims — a print-trim InDesign edition is offered only while it was built from the same
 * deck(s) as the edition beside it.
 */
import { describe, expect, test } from 'vitest'
import { currentTrims, trimLabel } from '@/lib/indesignTrims'

const trim = { key: 'a/x-indesign-6.25x9in.zip', bytes: 1, label: '6.25 × 9 in', width: 6.25, height: 9,
  deckKey: 'a/x-editable.pptx', deckBytes: 10 }

describe('current trims', () => {
  test('a trim built from the edition’s own deck is offered', () => {
    const block = { key: 'a/x-indesign.zip', deckKey: 'a/x-editable.pptx', deckBytes: 10, trims: { '450x648': trim } }
    expect(currentTrims(block)).toEqual([trim])
    expect(trimLabel(trim)).toBe('6.25 × 9 in')
  })

  test('a trim left over from an earlier deck is not', () => {
    const block = { key: 'a/x-indesign.zip', deckKey: 'a/x-editable.pptx', deckBytes: 11, trims: { '450x648': trim } }
    expect(currentTrims(block)).toEqual([])
    expect(currentTrims(undefined)).toEqual([])
    expect(currentTrims({ key: 'a/x-indesign.zip' })).toEqual([])
  })

  test('an all-languages file matches on every deck it holds', () => {
    const decks = [{ key: 'en.pptx', bytes: 1 }, { key: 'hi.pptx', bytes: 2 }]
    const t = { key: 'all-6.25x9in.zip', bytes: 1, width: 6.25, height: 9, decks }
    expect(currentTrims({ key: 'all.zip', decks, trims: { '450x648': t } })).toEqual([t])
    expect(currentTrims({ key: 'all.zip', decks: [decks[0]], trims: { '450x648': t } })).toEqual([])
    expect(trimLabel({ key: 'k', bytes: 1, width: 6.25, height: 9 })).toBe('6.25 × 9 in')
  })
})

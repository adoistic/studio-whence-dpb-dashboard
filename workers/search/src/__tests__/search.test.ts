import { describe, test, expect } from 'vitest'
import { matchesTerm, searchDocs, type IndexDoc } from '../search'
import { parseQuery } from '../query'

const doc = (over: Partial<IndexDoc> = {}): IndexDoc => ({
  comicId: 'biographies__x', line: 'biographies', slug: 'x',
  subject_slug: 's', program_slug: 'p', title: 'X', lang: 'en', page: 1,
  text: 'We will make our own polyester in Bombay', refs: ['p1.pl1.b1'], ...over,
})

describe('matchesTerm', () => {
  const hay = 'we will make our own polyester in bombay'
  test('matches a whole word', () => {
    expect(matchesTerm(hay, { text: 'polyester', exact: false })).toBe(true)
  })
  test('matches a prefix', () => {
    expect(matchesTerm(hay, { text: 'poly', exact: false })).toBe(true)
  })
  test('tolerates one typo in a longer word', () => {
    expect(matchesTerm(hay, { text: 'polyestar', exact: false })).toBe(true)
  })
  test('does not fuzz a short word into a false match', () => {
    expect(matchesTerm(hay, { text: 'cat', exact: false })).toBe(false)
  })
  test('an exact phrase must appear verbatim', () => {
    expect(matchesTerm(hay, { text: 'own polyester', exact: true })).toBe(true)
    expect(matchesTerm(hay, { text: 'polyester own', exact: true })).toBe(false)
  })
  test('an exact term is never fuzzed', () => {
    expect(matchesTerm(hay, { text: 'polyestar', exact: true })).toBe(false)
  })
  test('matches Devanagari words', () => {
    expect(matchesTerm('मैं मुख्यमंत्री हूँ', { text: 'मुख्यमंत्री', exact: false })).toBe(true)
  })
})

describe('searchDocs', () => {
  const docs = [
    doc({ page: 1 }),
    doc({ page: 2, text: 'A textile mill in Ahmedabad' }),
    doc({ page: 3, text: 'Nothing relevant here at all' }),
  ]

  test('AND requires every group', () => {
    const r = searchDocs(docs, parseQuery('polyester, bombay'), 10, 0)
    expect(r.total).toBe(1)
    expect(r.hits[0].doc.page).toBe(1)
  })

  test('a group is satisfied by any alternative', () => {
    const r = searchDocs(docs, parseQuery('polyester | textile'), 10, 0)
    expect(r.hits.map((h) => h.doc.page).sort()).toEqual([1, 2])
  })

  test('an unmatched AND group yields nothing', () => {
    expect(searchDocs(docs, parseQuery('polyester, ahmedabad'), 10, 0).total).toBe(0)
  })

  test('an empty query yields nothing rather than everything', () => {
    expect(searchDocs(docs, parseQuery('  '), 10, 0).total).toBe(0)
  })

  test('a snippet quotes the matching words', () => {
    const r = searchDocs(docs, parseQuery('polyester'), 10, 0)
    expect(r.hits[0].snippet.toLowerCase()).toContain('polyester')
  })

  test('an exact-word hit outranks a fuzzy one', () => {
    const set = [
      doc({ page: 1, text: 'polyestar was close' }),
      doc({ page: 2, text: 'polyester exactly' }),
    ]
    const r = searchDocs(set, parseQuery('polyester'), 10, 0)
    expect(r.hits[0].doc.page).toBe(2)
  })

  test('paginates without losing the total', () => {
    const many = Array.from({ length: 25 }, (_, i) => doc({ page: i + 1 }))
    const r = searchDocs(many, parseQuery('polyester'), 10, 20)
    expect(r.total).toBe(25)
    expect(r.hits).toHaveLength(5)
  })
})

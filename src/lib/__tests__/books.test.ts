import { describe, expect, test, vi } from 'vitest'

// surface.ts is a client module that imports the Firebase app; the routing
// helpers under test are pure, so stub the app the same way surface.test.ts does.
vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, googleProvider: {} }))
import {
  blockText, formatWords, inlineRuns, isBook, isBooksLine, locatePassage, manuscriptKeyFor, parseBookModel,
  parsePassageRef, passageAnchor, passageOrder, readingTime, type BookModel,
} from '@/lib/books'
import { categoryOfLineSlug, surfaceOfLineSlug } from '@/lib/surface'
import { anchorLabel, type Anchor } from '@/lib/feedbackTypes'

const model = (paras: string[]): BookModel => ({
  schemaVersion: 1, line: 'books-biographies', slug: 'openai', title: 'T', words: 0,
  chapters: [{
    n: 1, id: 'c1', title: 'One', words: 0, cites: [],
    blocks: paras.map((t, i) => ({ id: `c1.p${i + 1}`, kind: 'para' as const, parts: [{ t }] })),
  }],
})

describe('books surface routing', () => {
  test('books-<category> lines belong to the books surface', () => {
    expect(surfaceOfLineSlug('books-biographies')).toBe('books')
    expect(surfaceOfLineSlug('manga-indic')).toBe('manga')
    expect(surfaceOfLineSlug('biographies')).toBe('comics')
    expect(categoryOfLineSlug('books-biographies')).toBe('biographies')
    expect(isBooksLine('books-indic')).toBe(true)
    expect(isBooksLine('biographies')).toBe(false)
  })

  test('a prose doc is a book; its manuscript key nests under the slug so the allocation gate reads it', () => {
    expect(isBook({ format: 'prose' })).toBe(true)
    expect(isBook({ format: 'activity-book' })).toBe(false)
    expect(manuscriptKeyFor({ line: 'books-biographies', slug: 'openai' })).toBe('drafts/books-biographies/openai/manuscript.json')
    expect(manuscriptKeyFor({ line: 'x', slug: 'y', manuscriptKey: 'drafts/x/y/m.json' })).toBe('drafts/x/y/m.json')
  })
})

describe('reader model', () => {
  test('parses a model and rejects anything else', () => {
    expect(parseBookModel(JSON.stringify(model(['a'])))?.chapters).toHaveLength(1)
    expect(parseBookModel('not json')).toBeNull()
    expect(parseBookModel('{"title":"x"}')).toBeNull()
    expect(parseBookModel(null)).toBeNull()
  })

  test('block text drops citation markers', () => {
    expect(blockText({ kind: 'para', parts: [{ t: 'The lab opened' }, { cite: 1 }, { t: ' in December.' }] }))
      .toBe('The lab opened in December.')
  })

  test('italic markers render as runs and never reach the selection text', () => {
    expect(inlineRuns('Hao, in *Empire of AI*, says')).toEqual([
      { text: 'Hao, in ', italic: false }, { text: 'Empire of AI', italic: true }, { text: ', says', italic: false },
    ])
    expect(blockText({ kind: 'para', parts: [{ t: 'In *Supremacy* Olson writes' }] })).toBe('In Supremacy Olson writes')
  })

  test('formats words and reading time', () => {
    expect(formatWords(52_340)).toBe('52k words')
    expect(formatWords(4210)).toBe('4,210 words')
    expect(readingTime(4600)).toBe('20 min read')
    expect(readingTime(52_000)).toBe('4 hr read')
  })
})

describe('passage anchors', () => {
  const anchor = passageAnchor('c1.p2', 'the money arrived', 'Then the money arrived, late.') as Anchor

  test('builds a passage anchor with chapter and paragraph', () => {
    expect(anchor).toMatchObject({ kind: 'passage', ref: 'c1.p2', chapter: 1, para: 2, page: 1, quote: 'the money arrived' })
    expect(anchorLabel(anchor)).toBe('Ch 1 ¶2')
    expect(parsePassageRef('c12.p40')).toEqual({ chapter: 12, para: 40 })
    expect(passageAnchor('p3.pl1', 'x', 'x')).toBeNull()
  })

  test('exact when the paragraph still holds the words', () => {
    expect(locatePassage(model(['Intro.', 'Then the money arrived, late.']), anchor)).toEqual({ state: 'exact', blockId: 'c1.p2' })
  })

  test('moved when a paragraph was inserted above: the comment follows its words', () => {
    const m = model(['Intro.', 'A new paragraph.', 'Then the money arrived, late.'])
    expect(locatePassage(m, anchor)).toEqual({ state: 'moved', blockId: 'c1.p3' })
  })

  test('outdated when the words are gone, keeping its old place', () => {
    const m = model(['Intro.', 'The funding came through in March.'])
    expect(locatePassage(m, anchor)).toEqual({ state: 'outdated', blockId: 'c1.p2' })
  })

  test('document order sorts chapter then paragraph', () => {
    const refs = ['c2.p1', 'c1.p10', 'c1.p2', undefined]
    expect([...refs].sort((a, b) => passageOrder(a) - passageOrder(b))).toEqual(['c1.p2', 'c1.p10', 'c2.p1', undefined])
  })
})

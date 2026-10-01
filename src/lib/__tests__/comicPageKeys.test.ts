import { describe, expect, test } from 'vitest'
import { comicPageKeys, comicPdfKeys, comicWebPageKeys, webVariantKey } from '@/lib/comicPageKeys'
import type { Comic } from '@/types/content'

const base: Comic = {
  title: 'X', line: 'biographies', status: 'approved',
  slug: '01-the-comic', subject_slug: 'fig',
}

describe('comicPageKeys', () => {
  test('cover first, then zero-padded pages', () => {
    const c: Comic = { ...base, pages: { hasPages: true, count: 3, coverKey: 'images/comics/biographies/01-the-comic/cover.jpg' } }
    expect(comicPageKeys(c)).toEqual([
      'images/comics/biographies/01-the-comic/cover.jpg',
      'images/comics/biographies/01-the-comic/pages/page-01.jpg',
      'images/comics/biographies/01-the-comic/pages/page-02.jpg',
      'images/comics/biographies/01-the-comic/pages/page-03.jpg',
    ])
  })
  test('no cover → pages only', () => {
    const c: Comic = { ...base, pages: { hasPages: true, count: 1, coverKey: null } }
    expect(comicPageKeys(c)).toEqual(['images/comics/biographies/01-the-comic/pages/page-01.jpg'])
  })
  test('no pages block → empty', () => {
    expect(comicPageKeys(base)).toEqual([])
  })
})

describe('webVariantKey', () => {
  test('inserts web/ before the basename for pages and covers', () => {
    expect(webVariantKey('images/comics/indic/01-one-soul/pages/page-07.jpg'))
      .toBe('images/comics/indic/01-one-soul/pages/web/page-07.jpg')
    expect(webVariantKey('images/comics/indic/01-one-soul/cover.jpg'))
      .toBe('images/comics/indic/01-one-soul/web/cover.jpg')
  })
})

describe('comicWebPageKeys', () => {
  test('maps every master key to its web variant, order preserved', () => {
    const c: Comic = { ...base, pages: { hasPages: true, count: 2, coverKey: 'images/comics/biographies/01-the-comic/cover.jpg' } }
    expect(comicWebPageKeys(c)).toEqual([
      'images/comics/biographies/01-the-comic/web/cover.jpg',
      'images/comics/biographies/01-the-comic/pages/web/page-01.jpg',
      'images/comics/biographies/01-the-comic/pages/web/page-02.jpg',
    ])
  })
})

describe('comicPdfKeys', () => {
  const ic = 'artifacts/comics/biographies/01-the-comic/inside-covers'
  test('book order: cover, inside front, pages, inside back', () => {
    // Diamond, 30 Sep 2026: the downloaded PDF had no inside covers.
    const c: Comic = {
      ...base,
      pages: { hasPages: true, count: 2, coverKey: 'images/comics/biographies/01-the-comic/cover.jpg' },
      insideCovers: { language: 'English', images: [
        { key: `${ic}/inside-back-cover.png`, label: 'Inside back cover' },
        { key: `${ic}/inside-front-cover.png`, label: 'Inside front cover' },
      ] },
    }
    expect(comicPdfKeys(c)).toEqual([
      'images/comics/biographies/01-the-comic/cover.jpg',
      `${ic}/inside-front-cover.png`,
      'images/comics/biographies/01-the-comic/pages/page-01.jpg',
      'images/comics/biographies/01-the-comic/pages/page-02.jpg',
      `${ic}/inside-back-cover.png`,
    ])
  })
  test('no inside covers → same as comicPageKeys', () => {
    const c: Comic = { ...base, pages: { hasPages: true, count: 2, coverKey: null } }
    expect(comicPdfKeys(c)).toEqual(comicPageKeys(c))
  })
  test('no pages → empty, even with inside covers', () => {
    const c: Comic = { ...base, insideCovers: { language: 'English', images: [{ key: `${ic}/a.png`, label: 'Inside front cover' }] } }
    expect(comicPdfKeys(c)).toEqual([])
  })
})

import { describe, expect, test } from 'vitest'
import { comicPageKeys } from '@/lib/comicPageKeys'
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

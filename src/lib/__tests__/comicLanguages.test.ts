import { describe, test, expect } from 'vitest'
import { comicLanguages, draftKeyFor } from '@/lib/comicLanguages'
import type { Comic } from '@/types/content'

const base = { line: 'biographies', slug: '01-the-brand-machine' } as Comic

describe('comicLanguages', () => {
  test('a comic with no language manifest falls back to one English entry', () => {
    const langs = comicLanguages(base)
    expect(langs).toHaveLength(1)
    expect(langs[0].code).toBe('en')
    expect(langs[0].isOriginal).toBe(true)
    expect(langs[0].draftKey).toBe('drafts/biographies/01-the-brand-machine.html')
  })

  test('falls back to the comic-declared original when there is no manifest', () => {
    const hindi = { ...base, line: 'legacy', slug: 'rajyog', originalLanguage: 'hi' } as Comic
    const langs = comicLanguages(hindi)
    expect(langs[0].code).toBe('hi')
    expect(langs[0].label).toBe('हिंदी')
  })

  test('uses the published manifest when present', () => {
    const c = {
      ...base,
      originalLanguage: 'en',
      languages: [
        { code: 'en', label: 'English', draftKey: 'drafts/biographies/x.html', isOriginal: true },
        { code: 'hi', label: 'हिंदी', draftKey: 'drafts/biographies/x.hi.html', isOriginal: false },
      ],
    } as Comic
    expect(comicLanguages(c).map((l) => l.code)).toEqual(['en', 'hi'])
  })

  test('draftKeyFor returns the requested language key, or the original for an unknown code', () => {
    const c = {
      ...base,
      originalLanguage: 'en',
      languages: [
        { code: 'en', label: 'English', draftKey: 'drafts/b/x.html', isOriginal: true },
        { code: 'hi', label: 'हिंदी', draftKey: 'drafts/b/x.hi.html', isOriginal: false },
      ],
    } as Comic
    expect(draftKeyFor(c, 'hi')).toBe('drafts/b/x.hi.html')
    expect(draftKeyFor(c, 'zz')).toBe('drafts/b/x.html')
  })
})

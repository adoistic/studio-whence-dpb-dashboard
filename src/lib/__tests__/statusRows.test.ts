import { describe, test, expect } from 'vitest'
import {
  COMPONENTS,
  NOT_STARTED,
  comicRows,
  componentRows,
  hasResearch,
  isComplete,
  lineRows,
  normStatus,
  programRows,
  researchBand,
  subjectRows,
} from '../statusRows'
import type { Comic, Figure, Line, Program } from '@/types/content'

const comic = (slug: string, extra: Partial<Comic> = {}): Comic =>
  ({ title: slug, slug, line: 'indic', subject_slug: null, status: 'draft', ...extra } as Comic)
const fig = (slug: string, extra: Partial<Figure> = {}): Figure =>
  ({ slug, series: 'Cosmic Beings', line: 'indic', program_slug: 'cosmic-beings',
     sources_count: 2, words: 1000, ...extra })

describe('normStatus', () => {
  test('in_review and in-review are one stage', () => {
    expect(normStatus('in_review')).toBe('in-review')
    expect(normStatus('in-review')).toBe('in-review')
  })
  test('missing status does not crash', () => expect(normStatus(undefined)).toBe('unknown'))
})

describe('researchBand', () => {
  // A subject with sources is banded by the words backing it.
  test.each([
    [9_999, '1 · Seed (under 10k)'],
    [30_813, '2 · Working (10k–50k)'],
    [200_000, '3 · Substantial (50k–250k)'],
    [702_194, '4 · Deep (250k–1M)'],
    [3_096_590, '5 · Exhaustive (1M+ words)'],
  ])('%i words with sources → %s', (w, band) => expect(researchBand(w, 3)).toBe(band))

  test('an empty subject is Not started', () => expect(researchBand(0, 0)).toBe(NOT_STARTED))

  test('a scaffolded index stub is Not started, not Seed', () => {
    // The eleven Bollywood Legends figures: ~104 words of index stub, no sources.
    expect(researchBand(104, 0)).toBe(NOT_STARTED)
    expect(hasResearch(0, 104)).toBe(false)
  })

  test('a real dossier with no registered sources still counts as research', () => {
    // J.C. Bose: 244k words built from a reference collection, zero `sources`.
    expect(hasResearch(0, 244_451)).toBe(true)
    expect(researchBand(244_451, 0)).toBe('3 · Substantial (50k–250k)')
  })

  test('one source is enough, however thin the text', () => {
    expect(hasResearch(1, 0)).toBe(true)
  })
})

describe('comicRows — page state', () => {
  test('no art → No pages', () => {
    expect(comicRows([comic('a', { target_length_pages: 64 })])[0]['Page state']).toBe('0 · No pages')
  })
  test('part-drawn → Some pages', () => {
    const r = comicRows([comic('a', { target_length_pages: 64, pages: { hasPages: true, count: 20, coverKey: null } })])[0]
    expect(r['Page state']).toBe('2 · Some pages')
    expect(r['Pages %']).toBe(0.3125)
  })
  test('target reached → All pages (potentially complete)', () => {
    const r = comicRows([comic('a', { target_length_pages: 64, pages: { hasPages: true, count: 64, coverKey: 'k' } })])[0]
    expect(r['Page state']).toBe('3 · All pages (potentially complete)')
    expect(r.Cover).toBe(1)
  })
  test('over-target still counts as complete, and never exceeds sanity', () => {
    const r = comicRows([comic('a', { target_length_pages: 50, pages: { hasPages: true, count: 60, coverKey: null } })])[0]
    expect(r['Page state']).toBe('3 · All pages (potentially complete)')
  })
  test('no target page count → cannot claim complete', () => {
    const r = comicRows([comic('a', { pages: { hasPages: true, count: 12, coverKey: null } })])[0]
    expect(r['Page state']).toBe('2 · Some pages')
    expect(r['Pages %']).toBeNull()
  })
  test('a PUBLISHED book is complete even a page under target', () => {
    // The Diamond Activity Books: target 50 counts covers, published pages are
    // the 49-page interior. A shipped book is not half-made.
    const c = comic('capital-letters', {
      status: 'published', target_length_pages: 50,
      pages: { hasPages: true, count: 49, coverKey: 'k' },
    })
    expect(isComplete(c)).toBe(true)
    expect(comicRows([c])[0]['Page state']).toBe('3 · All pages (potentially complete)')
  })
  test('but a published book with no art at all is still No pages', () => {
    const c = comic('a', { status: 'published', target_length_pages: 50 })
    expect(isComplete(c)).toBe(false)
    expect(comicRows([c])[0]['Page state']).toBe('0 · No pages')
  })
  test('an unpublished book under target is NOT quietly promoted', () => {
    const c = comic('a', {
      status: 'approved', target_length_pages: 48,
      pages: { hasPages: true, count: 12, coverKey: null },
    })
    expect(isComplete(c)).toBe(false)
  })
  test('a comic with no subject is a standalone title', () => {
    expect(comicRows([comic('capital-letters', { subject_slug: '' })])[0].Subject).toBe('(standalone title)')
  })
  test('links point at the live comic route', () => {
    expect(comicRows([comic('a', { line: 'awareness' })])[0]._href).toBe('/awareness/a')
  })
})

describe('comicRows — components', () => {
  test('every component contributes a count column, a ✓ column and the tally', () => {
    const c = comic('a', {
      pages: { hasPages: true, count: 64, coverKey: 'k' },
      coverOptions: { language: 'en', options: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] },
      activities: { language: 'en', pages: [{ key: 'x', label: '1' }] },
      translations: [{ language: 'Hindi' }, { language: 'Tamil' }],
      amazonModules: { groups: [{ title: 'g', images: [{ key: 'i', label: 'l', bytes: 1, filename: 'f' }] }] },
    })
    const r = comicRows([c])[0]
    expect(r['Cover options']).toBe(2)
    expect(r['Cover options ✓']).toBe('Yes')
    expect(r['Amazon A+ modules']).toBe(1)
    expect(r['Back cover ✓']).toBe('No')
    expect(r['Translation languages']).toBe('Hindi, Tamil')
    // pages, cover, cover options, activities, translations, amazon modules
    expect(r['Components present']).toBe(6)
    expect(r['Components possible']).toBe(COMPONENTS.length)
  })
})

describe('subjectRows — the production pipeline', () => {
  test('research but no comic → Researched only', () => {
    const r = subjectRows([fig('vishnu')], [])[0]
    expect(r['Production stage']).toBe('1 · Researched only')
    expect(r['Has script']).toBe('No')
    expect(r['Furthest comic status']).toBe('researched')
  })
  test('a scaffolded stub is Not started, not Researched', () => {
    const r = subjectRows([fig('amitabh-bachchan', { sources_count: 0, words: 104 })], [])[0]
    expect(r['Production stage']).toBe('0 · Scaffolded, not started')
    expect(r['Has research']).toBe('No')
    expect(r['Research band']).toBe(NOT_STARTED)
  })
  test('a comic with no art → Script written', () => {
    const r = subjectRows([fig('ganesha')], [comic('c', { subject_slug: 'ganesha', target_length_pages: 64 })])[0]
    expect(r['Production stage']).toBe('2 · Script written')
    expect(r['Has script']).toBe('Yes')
  })
  test('part-drawn → Some pages made', () => {
    const r = subjectRows([fig('shiva')], [
      comic('c', { subject_slug: 'shiva', target_length_pages: 64, pages: { hasPages: true, count: 10, coverKey: null } }),
    ])[0]
    expect(r['Production stage']).toBe('3 · Some pages made')
    expect(r['Comics with all pages']).toBe(0)
    expect(r['Total pages made']).toBe(10)
  })
  test('fully drawn → All pages made', () => {
    const r = subjectRows([fig('shiva')], [
      comic('c', { subject_slug: 'shiva', target_length_pages: 64, pages: { hasPages: true, count: 64, coverKey: 'k' } }),
    ])[0]
    expect(r['Production stage']).toBe('4 · All pages made')
    expect(r['Comics with all pages']).toBe(1)
  })
  test('furthest status wins across several comics', () => {
    const r = subjectRows([fig('shiva')], [
      comic('a', { subject_slug: 'shiva', status: 'draft' }),
      comic('b', { subject_slug: 'shiva', status: 'published' }),
      comic('c', { subject_slug: 'shiva', status: 'in_review' as Comic['status'] }),
    ])[0]
    expect(r['Furthest comic status']).toBe('published')
    expect(r.Comics).toBe(3)
  })
  test('title-cased subject folders still join to their figure', () => {
    const r = subjectRows([fig('gita')], [comic('c', { subject_slug: 'Gita' })])[0]
    expect(r.Comics).toBe(1)
  })
  test('cross-listing is surfaced', () => {
    const r = subjectRows([fig('krishna', { program_slug: 'mahabharata', also_programs: ['cosmic-beings'] })], [])[0]
    expect(r['Also in programs']).toBe('cosmic-beings')
  })
})

describe('programRows', () => {
  const programs: Program[] = [
    { slug: 'cosmic-beings', line: 'indic', title: 'Cosmic Beings' },
    { slug: 'mahabharata', line: 'indic', title: 'Mahābhārata' },
  ]
  const figures = [
    fig('shiva'),
    fig('krishna', { program_slug: 'mahabharata', also_programs: ['cosmic-beings'] }),
  ]
  const comics = [
    comic('shiva-book', { subject_slug: 'shiva', program_slug: 'cosmic-beings' }),
    comic('krishna-book', { subject_slug: 'krishna', program_slug: 'mahabharata' }),
  ]

  test('a cross-listed being and their comic count under BOTH programs', () => {
    const [cosmic, mbh] = programRows(programs, comics, figures)
    expect(cosmic.Subjects).toBe(2)
    expect(cosmic['Cross-listed in']).toBe(1)
    expect(cosmic.Comics).toBe(2)
    expect(mbh.Subjects).toBe(1)
    expect(mbh.Comics).toBe(1)
  })
  test('program links point at the program route', () => {
    expect(programRows(programs, comics, figures)[0]._href).toBe('/programs/indic/cosmic-beings')
  })
})

describe('lineRows', () => {
  const lines = [{ slug: 'indic', title: 'Indic', subtitle: '', comics: [], figures: [] }] as Line[]
  test('page states partition the line’s comics', () => {
    const comics = [
      comic('a', { target_length_pages: 64 }),
      comic('b', { target_length_pages: 64, pages: { hasPages: true, count: 10, coverKey: null } }),
      comic('c', { target_length_pages: 64, pages: { hasPages: true, count: 64, coverKey: 'k' } }),
    ]
    const r = lineRows(lines, comics, [fig('shiva')], [])[0]
    expect(r['Comics with no pages']).toBe(1)
    expect(r['Comics with some pages']).toBe(1)
    expect(r['Comics with all pages']).toBe(1)
    expect(r.Comics).toBe(3)
    expect(r['Total pages made']).toBe(74)
    expect(r._href).toBe('/indic')
  })
})

describe('componentRows', () => {
  test('one row per comic × component, Present as 1/0', () => {
    const rows = comicRows([comic('a', { pages: { hasPages: true, count: 5, coverKey: null } })])
    const long = componentRows(rows)
    expect(long).toHaveLength(COMPONENTS.length)
    expect(long.find((r) => r.Component === 'Interior pages')).toMatchObject({ Present: 1, Count: 5 })
    expect(long.find((r) => r.Component === 'Cover')).toMatchObject({ Present: 0, Count: 0 })
  })
})

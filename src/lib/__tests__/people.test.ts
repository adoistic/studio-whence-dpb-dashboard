import { describe, test, expect } from 'vitest'
import { derivePeople, STAGE_RANK, personDocToRow, variantLabels, type PersonComic } from '../people'
import type { Figure, Comic } from '@/types/content'

describe('variantLabels', () => {
  const pc = (extra: Partial<PersonComic>): PersonComic =>
    ({ slug: 'x', line: 'l', title: 't', status: 'draft', ...extra })

  test('medicomics editions → "Standard"/"Premium" + page-count detail from target_length_pages', () => {
    const out = variantLabels([
      pc({ slug: '01-pink-ribbon-mystery-standard', comic_number: 1, target_length_pages: 24 }),
      pc({ slug: '02-pink-ribbon-mystery-premium', comic_number: 2, target_length_pages: 48 }),
    ])
    expect(out).toEqual([
      { primary: 'Standard', detail: '24 pages' },
      { primary: 'Premium', detail: '48 pages' },
    ])
  })

  test('non-edition multi-comic subject → falls back to titles with the shared prefix stripped', () => {
    const out = variantLabels([
      pc({ slug: 'c1', title: 'The Sky-High Dreamer' }),
      pc({ slug: 'c2', title: 'The Salt Years' }),
    ])
    expect(out).toEqual([{ primary: 'Sky-High Dreamer' }, { primary: 'Salt Years' }])
  })

  test('comic_number alone does NOT classify editions (biography 1/2 keeps its titles)', () => {
    const out = variantLabels([
      pc({ slug: 'early-years', title: 'Early Years', comic_number: 1 }),
      pc({ slug: 'peak-career', title: 'Peak Career', comic_number: 2 }),
    ])
    expect(out).toEqual([{ primary: 'Early Years' }, { primary: 'Peak Career' }])
  })

  test('editions with no page count → primary only, no detail', () => {
    const out = variantLabels([
      pc({ slug: 'a-standard' }),
      pc({ slug: 'b-premium' }),
    ])
    expect(out).toEqual([{ primary: 'Standard' }, { primary: 'Premium' }])
  })
})

const fig = (slug: string, extra: Partial<Figure> = {}): Figure =>
  ({ series: '01-Business-Legends', slug, sources_count: 3, words: 1000, ...extra })
const comic = (slug: string, subject_slug: string | null, status: Comic['status'], extra: Partial<Comic> = {}): Comic =>
  ({ title: slug, slug, subject_slug, line: 'biographies', status, ...extra } as Comic)

describe('derivePeople', () => {
  test('a figure with no comics → Researched', () => {
    const [p] = derivePeople([fig('jrd-tata')], [])
    expect(p).toMatchObject({ slug: 'jrd-tata', stage: 'researched', comicCount: 0, href: '/figures/jrd-tata' })
  })
  test('a figure with one comic → that comic status', () => {
    const [p] = derivePeople([fig('jrd-tata')], [comic('c1', 'jrd-tata', 'approved')])
    expect(p).toMatchObject({ stage: 'approved', comicCount: 1 })
  })
  test('a figure with several comics → furthest status + count', () => {
    const [p] = derivePeople([fig('jrd-tata')], [
      comic('c1', 'jrd-tata', 'draft', { comic_number: 2 }),
      comic('c2', 'jrd-tata', 'published', { comic_number: 1 }),
    ])
    expect(p.stage).toBe('published')
    expect(p.comicCount).toBe(2)
  })
  test('two comics, both missing comic_number, same status → no crash, deterministic by slug', () => {
    const [p] = derivePeople([fig('jrd-tata')], [
      comic('b-comic', 'jrd-tata', 'draft'),
      comic('a-comic', 'jrd-tata', 'draft'),
    ])
    // NaN-safe tie-break: Infinity - Infinity = NaN (falsy) → falls through to slug; 'a-comic' wins.
    expect(p.stage).toBe('draft')
    expect(p.comicCount).toBe(2)
  })
  test('case-insensitive subject match', () => {
    const [p] = derivePeople([fig('gita')], [comic('c1', 'Gita', 'draft')])
    expect(p.stage).toBe('draft')
  })
  test('orphan comic (no matching figure) gets its own row linking to the comic', () => {
    const people = derivePeople([fig('jrd-tata')], [comic('c9', 'unknown-person', 'draft')])
    const orphan = people.find((p) => p.slug === 'unknown-person')
    expect(orphan).toMatchObject({ stage: 'draft', comicCount: 1, href: '/biographies/c9' })
  })
  test('STAGE_RANK orders researched below all comic statuses', () => {
    expect(STAGE_RANK.researched).toBeLessThan(STAGE_RANK.draft)
    expect(STAGE_RANK.draft).toBeLessThan(STAGE_RANK.published)
  })
})

describe('personDocToRow', () => {
  test('maps a figure people-doc to a /figures/ row', () => {
    const r = personDocToRow({ slug: 'jrd-tata', name: 'Jrd Tata', line: 'biographies', series: 'S', stage: 'approved', stage_rank: 4, comic_count: 1, sources_count: 3, words: 100, furthest_comic_slug: '01-x', is_orphan: false } as any)
    expect(r.href).toBe('/figures/jrd-tata')
    expect(r.comicCount).toBe(1)
    expect(r.stageRank).toBe(4)
  })
  test('maps an orphan people-doc to the comic href', () => {
    const r = personDocToRow({ slug: 'nobody', name: 'Nobody', line: 'biographies', series: 'X', stage: 'draft', stage_rank: 2, comic_count: 1, sources_count: null, words: null, furthest_comic_slug: '01-orphan', is_orphan: true } as any)
    expect(r.href).toBe('/biographies/01-orphan')
    expect(r.sourcesCount).toBeNull()
  })
})

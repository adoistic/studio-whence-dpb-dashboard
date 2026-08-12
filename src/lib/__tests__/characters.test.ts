/**
 * Tests for src/lib/characters.ts — the repo-wide character roster.
 *
 * The two properties that matter most here are the two the brief is explicit
 * about, so they get the bulk of the coverage:
 *
 *   SURFACE SEPARATION — a manga character must never appear in a comics-surface
 *   listing, or the reverse. Tested at both enforcement points: which roster
 *   docs are READ (rosterLineSlugs), and which people survive the flatten
 *   (selectCharacters, including a roster that carries a foreign person).
 *
 *   IDENTITY IS (line, slug) — `manga/indic`'s Ram is a different character
 *   from Indic's Ram. Nothing may dedupe or merge them.
 *
 * Plus: undrawn people and undrawn versions are never filtered away, because
 * the whole surface exists to show what is still owed.
 */

import { describe, it, expect, vi } from 'vitest'

// The hook needs Firebase; the pure helpers are what these tests exercise, so
// stub the SDK handles rather than the module under test (as surface.test.ts does).
vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, googleProvider: {} }))

import {
  characterId,
  isOwed,
  rosterDocId,
  rosterLineSlugs,
  rosterTotals,
  selectCharacters,
  surfaceOfRoster,
  versionKeys,
  type RosterDoc,
  type RosterPerson,
  type RosterVersion,
} from '@/lib/characters'
import type { Line } from '@/types/content'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const line = (slug: string, extra: Partial<Line> = {}): Line =>
  ({ slug, title: slug, subtitle: '', comics: [], figures: [], ...extra }) as Line

const version = (v: Partial<RosterVersion> = {}): RosterVersion => ({
  stage: 'prime',
  drawn: true,
  key: 'artifacts/characters/indic/x/prime.png',
  comics: [{ slug: '01-a', title: 'Book One', pages: [3, 9] }],
  pages: 2,
  ...v,
})

const person = (p: Partial<RosterPerson> = {}): RosterPerson => ({
  slug: 'ram',
  name: 'Ram',
  line: 'indic',
  drawn: true,
  versions: [version()],
  pages: 2,
  comics: ['01-a'],
  ...p,
})

const roster = (r: Partial<RosterDoc> = {}): RosterDoc => ({
  line: 'indic',
  surface: 'comics',
  count: 1,
  drawn: 1,
  owed: 0,
  versions: 1,
  versionsDrawn: 1,
  comics: 1,
  people: [person()],
  ...r,
})

const INDIC = roster()
const MANGA = roster({
  line: 'manga-indic',
  surface: 'manga',
  people: [
    person({
      line: 'manga-indic',
      drawn: false,
      versions: [version({ stage: '—', drawn: false, key: null, pages: 64 })],
      pages: 64,
    }),
  ],
})

// ─── Doc ids ─────────────────────────────────────────────────────────────────

describe('rosterDocId', () => {
  it('names the per-line roster doc', () => {
    expect(rosterDocId('biographies')).toBe('characters_biographies')
    expect(rosterDocId('manga-indic')).toBe('characters_manga-indic')
  })
})

describe('surfaceOfRoster', () => {
  it('honours the doc’s own surface', () => {
    expect(surfaceOfRoster({ line: 'biographies', surface: 'manga' })).toBe('manga')
  })
  it('falls back to the line-slug prefix when the field is missing or junk', () => {
    expect(surfaceOfRoster({ line: 'manga-indic' } as RosterDoc)).toBe('manga')
    expect(surfaceOfRoster({ line: 'indic', surface: 'zines' } as unknown as RosterDoc)).toBe('comics')
  })
})

// ─── Surface separation: which docs are READ ─────────────────────────────────

describe('rosterLineSlugs — a surface only ever reads its own rosters', () => {
  const lines = [
    line('biographies'), line('indic'), line('awareness'),
    line('medicomics'), line('manga-indic'),
  ]

  it('the comics surface never reaches a manga roster', () => {
    const slugs = rosterLineSlugs(lines, 'comics')
    expect(slugs).toEqual(['biographies', 'indic', 'awareness', 'medicomics'])
    expect(slugs).not.toContain('manga-indic')
  })

  it('the manga surface never reaches a comics roster', () => {
    expect(rosterLineSlugs(lines, 'manga')).toEqual(['manga-indic'])
  })

  it('an unresolved surface reads every line, matching the home page', () => {
    expect(rosterLineSlugs(lines, null)).toHaveLength(5)
  })

  it('survives a null line list', () => {
    expect(rosterLineSlugs(null, 'comics')).toEqual([])
  })
})

// ─── Surface separation: which PEOPLE survive ────────────────────────────────

describe('selectCharacters — surface separation', () => {
  it('drops a manga roster from the comics surface', () => {
    const out = selectCharacters([INDIC, MANGA], 'comics')
    expect(out).toHaveLength(1)
    expect(out[0].line).toBe('indic')
  })

  it('drops a comics roster from the manga surface', () => {
    const out = selectCharacters([INDIC, MANGA], 'manga')
    expect(out).toHaveLength(1)
    expect(out[0].line).toBe('manga-indic')
  })

  it('drops a foreign person even when the roster itself passes', () => {
    // Second line of defence: a comics roster that somehow carries a manga
    // person must still not leak that person into the comics listing.
    const tainted = roster({
      people: [person(), person({ slug: 'hanuman', name: 'Hanuman', line: 'manga-indic' })],
    })
    const out = selectCharacters([tainted], 'comics')
    expect(out.map((p) => p.slug)).toEqual(['ram'])
  })

  it('falls back to the roster’s line for a person that carries none', () => {
    const legacy = roster({ people: [{ ...person(), line: '' } as RosterPerson] })
    expect(selectCharacters([legacy], 'comics')[0].line).toBe('indic')
  })

  it('never merges two lines’ characters that share a slug', () => {
    // manga/indic's Ram is a DIFFERENT character from Indic's Ram.
    const out = selectCharacters([INDIC, MANGA], null)
    expect(out).toHaveLength(2)
    expect(out.map(characterId).sort()).toEqual(['indic/ram', 'manga-indic/ram'])
  })
})

// ─── Filters ─────────────────────────────────────────────────────────────────

describe('selectCharacters — filters', () => {
  const undrawn = person({
    slug: 'sita', name: 'Sita', drawn: false, pages: 30,
    versions: [version({ stage: '—', drawn: false, key: null, pages: 30 })],
  })
  const partly = person({
    slug: 'lakshman', name: 'Lakshman', drawn: true, pages: 12,
    versions: [version({ stage: 'boy' }), version({ stage: 'exile', drawn: false, key: null })],
  })
  const all = roster({ people: [person(), undrawn, partly] })

  it('shows every character by default, drawn and undrawn alike', () => {
    expect(selectCharacters([all], 'comics')).toHaveLength(3)
  })

  it('"drawn" keeps only characters with art', () => {
    expect(selectCharacters([all], 'comics', { drawn: 'drawn' }).map((p) => p.slug))
      .toEqual(['lakshman', 'ram'])
  })

  it('"owed" is the art build list: no art at all, OR any version still missing', () => {
    expect(selectCharacters([all], 'comics', { drawn: 'owed' }).map((p) => p.slug))
      .toEqual(['sita', 'lakshman'])
  })

  it('filters by line', () => {
    const out = selectCharacters([INDIC, roster({ line: 'awareness', people: [person({ line: 'awareness', slug: 'nila', name: 'Nila' })] })], 'comics', { line: 'awareness' })
    expect(out.map((p) => p.slug)).toEqual(['nila'])
  })

  it('searches name and slug, case-insensitively', () => {
    expect(selectCharacters([all], 'comics', { q: 'SIT' }).map((p) => p.slug)).toEqual(['sita'])
    expect(selectCharacters([all], 'comics', { q: 'lakshman' })).toHaveLength(1)
    expect(selectCharacters([all], 'comics', { q: 'nobody' })).toHaveLength(0)
  })

  it('sorts by page count desc so the busiest characters lead, drawn or not', () => {
    expect(selectCharacters([all], 'comics').map((p) => p.slug)).toEqual(['sita', 'lakshman', 'ram'])
  })
})

describe('isOwed', () => {
  it('is true when nothing is drawn', () => {
    expect(isOwed(person({ drawn: false }))).toBe(true)
  })
  it('is true when one version of several is still missing', () => {
    expect(isOwed(person({ versions: [version(), version({ drawn: false, key: null })] }))).toBe(true)
  })
  it('is false when every version exists', () => {
    expect(isOwed(person())).toBe(false)
  })
})

// ─── Totals + keys ───────────────────────────────────────────────────────────

describe('rosterTotals', () => {
  it('counts what is actually on screen, not the doc headers', () => {
    const people = [
      person(),
      person({ slug: 'sita', drawn: false, versions: [version({ drawn: false, key: null })] }),
    ]
    expect(rosterTotals(people)).toEqual({
      characters: 2, drawn: 1, owed: 1, versions: 2, versionsDrawn: 1, comics: 1,
    })
  })

  it('counts a comic once per line, never merging two lines’ books', () => {
    const people = [person(), person({ line: 'manga-indic' })]
    expect(rosterTotals(people).comics).toBe(2)
  })

  it('handles an empty list', () => {
    expect(rosterTotals([])).toEqual({
      characters: 0, drawn: 0, owed: 0, versions: 0, versionsDrawn: 0, comics: 0,
    })
  })
})

describe('versionKeys', () => {
  it('collects only the drawn keys, in render order', () => {
    expect(versionKeys([person({ versions: [version({ key: 'a' }), version({ key: null })] })]))
      .toEqual(['a'])
  })
})

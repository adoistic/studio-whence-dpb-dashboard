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
  comicHref,
  isOwed,
  isSharedPerson,
  personKind,
  personLines,
  rosterDocId,
  rosterLineSlugs,
  rosterTotals,
  selectCharacters,
  surfaceOfRoster,
  versionKeys,
  SHARED_LINE,
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

// The sixth doc: studio/Diamond IP with ONE locked design, staged by several
// lines and belonging to every surface.
const CHANAKYA: RosterPerson = {
  slug: 'little-chanakya',
  name: 'Little Chanakya',
  line: SHARED_LINE,
  kind: 'shared',
  lines: ['awareness', 'medicomics'],
  drawn: true,
  pages: 641,
  comics: ['awareness/01-future-shock', 'medicomics/01-the-pimple-panic'],
  versions: [
    {
      stage: 'host',
      drawn: true,
      key: 'artifacts/characters/shared/little-chanakya/host.png',
      comics: [
        { slug: '01-future-shock', title: 'Future Shock', pages: [1] },
        { slug: '01-the-pimple-panic', title: 'The Pimple Panic', pages: [2] },
      ],
      pages: 641,
    },
  ],
}

const SHARED = roster({
  line: SHARED_LINE,
  surface: 'both' as RosterDoc['surface'],
  people: [CHANAKYA],
})

// ─── Doc ids ─────────────────────────────────────────────────────────────────

describe('rosterDocId', () => {
  it('names the per-line roster doc', () => {
    expect(rosterDocId('biographies')).toBe('characters_biographies')
    expect(rosterDocId('manga-indic')).toBe('characters_manga-indic')
  })

  it('names the shared-IP doc', () => {
    expect(rosterDocId(SHARED_LINE)).toBe('characters_shared')
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
  it('reads the shared doc as "both", declared or merely named', () => {
    expect(surfaceOfRoster(SHARED)).toBe('both')
    expect(surfaceOfRoster({ line: SHARED_LINE } as RosterDoc)).toBe('both')
  })
  it('is a THIRD value: no real line slug can ever produce it', () => {
    for (const slug of ['biographies', 'indic', 'awareness', 'medicomics', 'manga-indic']) {
      expect(surfaceOfRoster({ line: slug } as RosterDoc)).not.toBe('both')
    }
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
    expect(slugs).toEqual(['biographies', 'indic', 'awareness', 'medicomics', 'shared'])
    expect(slugs).not.toContain('manga-indic')
  })

  it('the manga surface never reaches a comics roster', () => {
    expect(rosterLineSlugs(lines, 'manga')).toEqual(['manga-indic', 'shared'])
  })

  it('reads the shared doc on BOTH surfaces — one locked design, every line', () => {
    expect(rosterLineSlugs(lines, 'comics')).toContain(SHARED_LINE)
    expect(rosterLineSlugs(lines, 'manga')).toContain(SHARED_LINE)
    expect(rosterLineSlugs(lines, null)).toContain(SHARED_LINE)
  })

  it('an unresolved surface reads every line, matching the home page', () => {
    expect(rosterLineSlugs(lines, null)).toHaveLength(6) // 5 lines + shared
  })

  it('never asks for the shared doc twice, even if the catalog lists it', () => {
    expect(rosterLineSlugs([...lines, line(SHARED_LINE)], 'comics')
      .filter((s) => s === SHARED_LINE)).toHaveLength(1)
  })

  it('survives a null line list — the shared cast is still readable', () => {
    expect(rosterLineSlugs(null, 'comics')).toEqual([SHARED_LINE])
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

// ─── Shared IP: one character, every surface, exactly once ───────────────────

describe('selectCharacters — the shared roster belongs to both surfaces', () => {
  it('admits a "both" roster to the comics listing', () => {
    expect(selectCharacters([INDIC, MANGA, SHARED], 'comics').map((p) => p.slug))
      .toContain('little-chanakya')
  })

  it('admits the same "both" roster to the manga listing', () => {
    expect(selectCharacters([INDIC, MANGA, SHARED], 'manga').map((p) => p.slug))
      .toContain('little-chanakya')
  })

  it('admits shared IP without weakening the split either way', () => {
    // The whole point: he crosses, and nobody else does.
    const comics = selectCharacters([INDIC, MANGA, SHARED], 'comics')
    const manga = selectCharacters([INDIC, MANGA, SHARED], 'manga')
    expect(comics.map(characterId).sort()).toEqual(['indic/ram', 'shared/little-chanakya'])
    expect(manga.map(characterId).sort()).toEqual(['manga-indic/ram', 'shared/little-chanakya'])
  })

  it('lists him ONCE even though four lines stage him', () => {
    const out = selectCharacters([SHARED], 'comics')
    expect(out).toHaveLength(1)
    expect(out[0].pages).toBe(641)
  })

  it('never doubles him when a stale line doc still carries his old copy', () => {
    // The defect being fixed: keyed per line, the Awareness copy was drawn and
    // the MediComics copy was "still to draw" — the same person, twice, with
    // contradictory status. The shared entry supersedes the line copy.
    const staleAwareness = roster({
      line: 'awareness',
      people: [person({
        slug: 'little-chanakya', name: 'Little Chanakya', line: 'awareness',
        drawn: false, pages: 21,
        versions: [version({ stage: '—', drawn: false, key: null, pages: 21 })],
      })],
    })
    const out = selectCharacters([staleAwareness, SHARED], 'comics')
    expect(out.filter((p) => p.slug === 'little-chanakya')).toHaveLength(1)
    expect(out[0].line).toBe(SHARED_LINE)
    expect(out[0].drawn).toBe(true)
  })

  it('never doubles him when the shared doc is read twice', () => {
    expect(selectCharacters([SHARED, SHARED], 'comics')).toHaveLength(1)
  })

  it('leaves a line-owned character who merely SHARES A SLUG alone', () => {
    // Identity is (line, slug). Diamond's Arjun is shared IP; a Mahabharata
    // Arjun published under `indic`, on a line the shared entry does not claim,
    // is a different person and must survive.
    const sharedArjun = roster({
      line: SHARED_LINE,
      surface: 'both' as RosterDoc['surface'],
      people: [{ ...CHANAKYA, slug: 'arjun', name: 'Arjun', lines: ['awareness'] }],
    })
    const indicArjun = roster({
      people: [person({ slug: 'arjun', name: 'Arjun', line: 'indic' })],
    })
    expect(selectCharacters([indicArjun, sharedArjun], 'comics').map(characterId).sort())
      .toEqual(['indic/arjun', 'shared/arjun'])
  })

  it('matches the line filter against every line that stages him', () => {
    const of = (line: string) =>
      selectCharacters([INDIC, SHARED], 'comics', { line }).map((p) => p.slug)
    expect(of('awareness')).toEqual(['little-chanakya'])
    expect(of('medicomics')).toEqual(['little-chanakya'])
    // …and not against lines that do not.
    expect(of('indic')).toEqual(['ram'])
  })

  it('resolves a comic link back to the line that publishes it', () => {
    expect(comicHref(CHANAKYA, '01-the-pimple-panic')).toBe('/medicomics/01-the-pimple-panic')
    expect(comicHref(CHANAKYA, '99-unknown')).toBeNull()
    expect(comicHref(person(), '01-a')).toBe('/indic/01-a')
  })

  it('counts a shared character’s books as those lines’ books', () => {
    // Not as two books of a line called `shared` — the shared doc's slugs are
    // already line-qualified, and the count must agree with the line docs.
    expect(rosterTotals([CHANAKYA]).comics).toBe(2)
  })
})

describe('shared identity helpers', () => {
  it('recognises shared IP by kind or by the doc it came from', () => {
    expect(isSharedPerson(CHANAKYA)).toBe(true)
    expect(isSharedPerson({ line: SHARED_LINE })).toBe(true)
    expect(isSharedPerson(person())).toBe(false)
  })

  it('gives every entry a kind, defaulting an older doc to "line"', () => {
    expect(personKind(CHANAKYA)).toBe('shared')
    expect(personKind(person({ kind: 'role' }))).toBe('role')
    expect(personKind(person())).toBe('line')
  })

  it('reports the lines that actually stage a character', () => {
    expect(personLines(CHANAKYA)).toEqual(['awareness', 'medicomics'])
    expect(personLines(person())).toEqual(['indic'])
    // `shared` is a filing location, never a line anyone browses.
    expect(personLines({ line: SHARED_LINE, kind: 'shared' })).toEqual([])
  })
})

// ─── Filters ─────────────────────────────────────────────────────────────────

describe('selectCharacters — kind', () => {
  const role = person({
    slug: 'father--01-a', name: 'Father · Book One', kind: 'role',
    drawn: false, pages: 7,
    versions: [version({ stage: '—', drawn: false, key: null, pages: 7 })],
  })
  const docs = [roster({ people: [person(), role] }), SHARED]

  it('shows every kind by default', () => {
    expect(selectCharacters(docs, 'comics')).toHaveLength(3)
  })

  it('"named" separates people from the unnamed walk-ons', () => {
    expect(selectCharacters(docs, 'comics', { kind: 'named' }).map((p) => p.slug))
      .toEqual(['little-chanakya', 'ram'])
  })

  it('"role" keeps only the walk-ons, which now outnumber the names', () => {
    expect(selectCharacters(docs, 'comics', { kind: 'role' }).map((p) => p.slug))
      .toEqual(['father--01-a'])
  })

  it('"shared" keeps only the studio’s own locked cast', () => {
    expect(selectCharacters(docs, 'comics', { kind: 'shared' }).map((p) => p.slug))
      .toEqual(['little-chanakya'])
  })

  it('treats a doc with no kind field at all as a named line character', () => {
    expect(selectCharacters([INDIC], 'comics', { kind: 'named' })).toHaveLength(1)
    expect(selectCharacters([INDIC], 'comics', { kind: 'role' })).toHaveLength(0)
  })

  it('combines with the other filters rather than replacing them', () => {
    expect(selectCharacters(docs, 'comics', { kind: 'named', drawn: 'owed' })).toHaveLength(0)
    expect(selectCharacters(docs, 'comics', { kind: 'role', drawn: 'owed' })).toHaveLength(1)
  })
})

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

/**
 * The published documents, run through the code that reads them.
 *
 * Every other test here uses fixtures the test author wrote, so it proves the
 * functions agree with an idea of the data. This one loads the five roster docs
 * that were actually published to Firestore and asserts the contract holds
 * against them — the shape, the surface split, and the counts the tab shows.
 *
 * It skips itself when the dump is absent, so CI and a fresh clone stay green:
 *
 *     tools/… → /tmp/real-rosters.json   (see publish_character_roster.py)
 *
 * Coverage:
 *  1. every published doc parses into the declared RosterDoc shape
 *  2. manga-indic is the manga surface and every other line is comics
 *  3. no character is shared across lines — identity is (line, slug)
 *  4. selectCharacters never returns a person from the other surface
 *  5. rosterTotals matches the counts the publisher wrote into each doc
 *  6. every drawn version carries a key, every undrawn one carries none
 *  7. an art key always names its own line, so manga art cannot leak
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

// The module exports a hook that needs Firebase at import time; only the pure
// helpers are exercised here, so stub the SDK handles (as characters.test.ts does).
vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, googleProvider: {} }))

import {
  selectCharacters, rosterTotals, versionKeys, surfaceOfRoster,
  characterId, isOwed, type RosterDoc, type RosterPerson,
} from '../characters'

const DUMP = '/tmp/real-rosters.json'
const run = existsSync(DUMP) ? describe : describe.skip

run('the published character rosters', () => {
  const raw = existsSync(DUMP)
    ? (JSON.parse(readFileSync(DUMP, 'utf8')) as Record<string, RosterDoc>)
    : {}
  const docs = Object.values(raw)
  const all: RosterPerson[] = docs.flatMap((d) => d.people ?? [])

  it('1. parses into the declared shape', () => {
    expect(docs.length).toBe(5)
    for (const d of docs) {
      expect(typeof d.line).toBe('string')
      expect(['comics', 'manga']).toContain(d.surface)
      expect(Array.isArray(d.people)).toBe(true)
      expect(d.people.length).toBe(d.count)
      for (const p of d.people) {
        expect(p.line).toBe(d.line)
        expect(typeof p.slug).toBe('string')
        expect(p.versions.length).toBeGreaterThan(0)
      }
    }
  })

  it('2. puts manga-indic on the manga surface and nothing else', () => {
    for (const d of docs) {
      expect(surfaceOfRoster(d)).toBe(d.line === 'manga-indic' ? 'manga' : 'comics')
    }
  })

  it('3. keeps identity line-qualified — no character spans two lines', () => {
    const seen = new Set<string>()
    for (const p of all) {
      const id = characterId(p)
      expect(seen.has(id)).toBe(false)
      seen.add(id)
    }
    // and the case the brief is explicit about: a shared name in two worlds
    const rams = all.filter((p) => p.slug === 'ram' || p.slug === 'rama')
    const lines = new Set(rams.map((p) => p.line))
    if (rams.length > 1) expect(lines.size).toBe(rams.length)
  })

  it('4. never selects a person from the other surface', () => {
    const comics = selectCharacters(docs, 'comics')
    const manga = selectCharacters(docs, 'manga')
    expect(comics.every((p) => p.line !== 'manga-indic')).toBe(true)
    expect(manga.every((p) => p.line === 'manga-indic')).toBe(true)
    // the two surfaces partition the corpus — nobody lost, nobody counted twice
    expect(comics.length + manga.length).toBe(all.length)
    expect(manga.length).toBe(raw['manga-indic'].count)
  })

  it('5. agrees with the counts the publisher wrote', () => {
    for (const d of docs) {
      const t = rosterTotals(d.people)
      expect(t.characters).toBe(d.count)
      expect(t.drawn).toBe(d.drawn)
      expect(t.owed).toBe(d.owed)
      expect(t.versions).toBe(d.versions)
      expect(t.versionsDrawn).toBe(d.versionsDrawn)
    }
  })

  it('6. gives every drawn version a key and every undrawn one none', () => {
    for (const p of all) {
      for (const v of p.versions) {
        if (v.drawn) expect(v.key, `${p.line}/${p.slug} ${v.stage}`).toBeTruthy()
        else expect(v.key).toBeFalsy()
      }
      expect(isOwed(p)).toBe(p.versions.some((v) => !v.drawn))
    }
  })

  it('7. names its own line in every art key, so manga art cannot leak', () => {
    for (const d of docs) {
      for (const k of versionKeys(d.people)) {
        expect(k.startsWith(`artifacts/characters/${d.line}/`), k).toBe(true)
      }
    }
  })
})

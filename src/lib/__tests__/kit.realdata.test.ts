/**
 * The published kit documents, run through the code that reads them.
 *
 * The sibling of `characters.realdata.test.ts`, and there for the same reason:
 * every other test uses fixtures the test author wrote, so it proves the
 * functions agree with an IDEA of the data. This one loads what was actually
 * published to Firestore and asserts the contract holds against it.
 *
 * It matters more than usual here because the kit surface cannot be eyeballed
 * without signing in, and the whole point of the kit is that a wrong mark on a
 * page is a defect a reader spots instantly.
 *
 * Skips itself when the dump is absent, so CI and a fresh clone stay green:
 *
 *     /tmp/real-kit.json   (see publish_kit_roster.py)
 *
 * Coverage:
 *  1. every published doc parses into the declared KitDoc shape
 *  2. a drawn era carries a key; an undrawn one carries none
 *  3. an art key always names its own domain and mark, so nothing can cross
 *  4. kitTotals matches the counts the publisher wrote into the doc
 *  5. era spans within a mark are ordered and do not overlap — the property the
 *     page-prompt builder relies on to pick exactly one form for a year
 *  6. eraForYear agrees with the builder: one era per year, or none
 *  7. selectMarks never drops an owed mark from the default view
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, googleProvider: {} }))

import {
  eraForYear, eraSpan, kitTotals, markKind, selectMarks,
  type KitDoc,
} from '../kit'

const DUMP = '/tmp/real-kit.json'
const run = existsSync(DUMP) ? describe : describe.skip

run('the published brand kit', () => {
  const docs: KitDoc[] = existsSync(DUMP)
    ? (JSON.parse(readFileSync(DUMP, 'utf8')) as KitDoc[])
    : []

  it('publishes at least one domain', () => {
    expect(docs.length).toBeGreaterThan(0)
  })

  it('parses into the declared shape', () => {
    for (const d of docs) {
      expect(typeof d.domain).toBe('string')
      expect(Array.isArray(d.marks)).toBe(true)
      for (const m of d.marks) {
        expect(typeof m.slug).toBe('string')
        expect(typeof m.name).toBe('string')
        expect(['logo', 'product', 'building']).toContain(markKind(m))
        expect(Array.isArray(m.eras)).toBe(true)
        expect(m.eras.length).toBeGreaterThan(0)
        expect(typeof m.pages).toBe('number')
        expect(Array.isArray(m.books)).toBe(true)
      }
    }
  })

  it('gives every drawn era a key and every undrawn era none', () => {
    for (const d of docs) {
      for (const m of d.marks) {
        for (const e of m.eras) {
          if (e.drawn) expect(e.key, `${m.slug}/${e.slug}`).toBeTruthy()
          else expect(e.key, `${m.slug}/${e.slug}`).toBeNull()
        }
      }
    }
  })

  it('keys art under its own domain and mark', () => {
    for (const d of docs) {
      for (const m of d.marks) {
        for (const e of m.eras) {
          if (!e.key) continue
          expect(e.key).toBe(`artifacts/kit/${d.domain}/${m.slug}/${e.slug}.png`)
        }
      }
    }
  })

  it('agrees with the counts the publisher wrote', () => {
    const t = kitTotals(docs)
    const marks = docs.reduce((n, d) => n + d.count, 0)
    const drawn = docs.reduce((n, d) => n + d.erasDrawn, 0)
    const owed = docs.reduce((n, d) => n + d.erasOwed, 0)
    expect(t.marks).toBe(marks)
    expect(t.drawn).toBe(drawn)
    expect(t.owed).toBe(owed)
    expect(t.eras).toBe(drawn + owed)
  })

  it('orders a mark\'s eras and never overlaps them', () => {
    // THE PROPERTY THE PAGE PROMPT DEPENDS ON. The builder walks the eras and
    // takes the first that covers the page's year, so two eras covering one
    // year would make the choice depend on declaration order — exactly the
    // silent-wrong-answer class this kit exists to remove.
    for (const d of docs) {
      for (const m of d.marks) {
        const spans = m.eras
          .filter((e) => e.from != null)
          .map((e) => [e.from as number, e.to ?? Infinity] as const)
        for (let i = 1; i < spans.length; i += 1) {
          expect(spans[i][0], `${m.slug}: eras out of order`)
            .toBeGreaterThanOrEqual(spans[i - 1][0])
          // STRICTLY greater. Both bounds are inclusive, so `to` must be the
          // year BEFORE the next era begins — sharing the changeover year put
          // 22 of these in both eras at once, and a 1984 Apple page then took
          // the 1977 wordmark lockup that Landor had dropped that very year.
          expect(spans[i][0], `${m.slug}: ${eraSpan(m.eras[i - 1])} overlaps ${eraSpan(m.eras[i])}`)
            .toBeGreaterThan(spans[i - 1][1])
        }
      }
    }
  })

  it('resolves each staged year to exactly one era, or to none', () => {
    for (const d of docs) {
      for (const m of d.marks) {
        if (!m.yearSpan) continue
        for (let y = m.yearSpan[0]; y <= m.yearSpan[1]; y += 1) {
          const hits = m.eras.filter(
            (e) => (e.from == null || y >= e.from) && (e.to == null || y <= e.to),
          )
          expect(hits.length, `${m.slug} @ ${y}`).toBeLessThanOrEqual(1)
          expect(eraForYear(m, y)).toBe(hits[0] ?? null)
        }
      }
    }
  })

  it('keeps owed marks in the default view', () => {
    // What is missing is the reason to open the tab, so the unfiltered list
    // must never quietly drop it.
    const all = selectMarks(docs)
    const owed = docs.flatMap((d) => d.marks.filter((m) => m.eras.some((e) => !e.drawn)))
    for (const m of owed) {
      expect(all.some((x) => x.slug === m.slug), `${m.slug} dropped`).toBe(true)
    }
  })
})

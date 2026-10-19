/**
 * The published casts, run through the code that reads them.
 *
 * Every other cast test uses fixtures the test author wrote. This one loads the cast
 * docs actually published to Firestore and asserts the contract holds against them.
 * It skips itself unless `REAL_CASTS` names a JSON dump (an array of `casts/*` docs),
 * so CI and a fresh clone stay green:
 *
 *     REAL_CASTS=/path/casts.json npx vitest run src/lib/__tests__/casts.realdata.test.ts
 *
 * Coverage:
 *  1. every doc parses into the CastDoc shape, its id naming its own line and slug
 *  2. every drawn version has a sheet key and a thumbnail; no undrawn one has either
 *  3. a sheet key names its own line and owner, so one line's art can't stand for another's
 *  4. a manga cast holds only manga characters (plus shared IP), and the reverse
 *  5. the union never merges two lines' characters and lists shared IP once
 *  6. the counts the publisher wrote agree with the people in the doc
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { castTotals, mergeCasts, type CastDoc } from '@/lib/castModel'

const DUMP = process.env.REAL_CASTS ?? ''
const run = DUMP && existsSync(DUMP) ? describe : describe.skip

run('the published casts', () => {
  const docs = (DUMP && existsSync(DUMP) ? JSON.parse(readFileSync(DUMP, 'utf8')) : []) as CastDoc[]
  const isManga = (line: string) => line.startsWith('manga-')

  it('1. parses into the declared shape', () => {
    expect(docs.length).toBeGreaterThan(100)
    for (const d of docs) {
      expect(d.comicId).toBe(`${d.line}__${d.slug}`)
      expect(Array.isArray(d.people)).toBe(true)
      for (const p of d.people) {
        expect(['named', 'generalized', 'shared']).toContain(p.kind)
        expect(p.id).toBeTruthy()
        expect(p.versions.length).toBeGreaterThan(0)
      }
    }
  })

  it('2–3. drawn versions carry a sheet and a thumbnail under their own line and owner', () => {
    for (const d of docs) {
      for (const p of d.people) {
        for (const v of p.versions) {
          if (v.drawn) {
            expect(v.key, `${d.comicId} ${p.id} ${v.stage}`).toMatch(new RegExp(`^artifacts/characters/${p.line}/[^/]+/[^/]+\\.(png|jpg)$`))
            expect(v.thumb).toMatch(new RegExp(`^artifacts/characters/${p.line}/[^/]+/web/[^/]+\\.jpg$`))
            expect(v.key!.split('/')[3]).toBe(v.thumb!.split('/')[3])
          } else {
            expect(v.key).toBeUndefined()
            expect(v.thumb).toBeUndefined()
          }
        }
      }
    }
  })

  it('4. a manga cast and a comics cast never hold each other’s characters', () => {
    for (const d of docs) {
      for (const p of d.people) {
        if (p.line === 'shared') continue
        expect(isManga(p.line), `${d.comicId} holds ${p.line}/${p.id}`).toBe(isManga(d.line))
      }
    }
  })

  it('5. the union keeps lines apart and lists shared IP once', () => {
    const all = mergeCasts(docs)
    const uids = all.map((c) => c.uid)
    expect(new Set(uids).size).toBe(uids.length)
    const lc = all.filter((c) => c.id === 'little-chanakya')
    expect(lc.length).toBeLessThanOrEqual(1)
    if (lc.length) expect(lc[0].line).toBe('shared')
  })

  it('6. the published counts agree with the people', () => {
    for (const d of docs.filter((x) => !x.library)) {
      const t = castTotals(mergeCasts([d]))
      expect(d.counts.characters, d.comicId).toBe(d.people.length)
      expect(d.counts.versions, d.comicId).toBe(t.versions)
      expect(d.counts.versionsDrawn, d.comicId).toBe(t.versionsDrawn)
    }
  })
})

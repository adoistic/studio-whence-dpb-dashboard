'use client'

/**
 * characters.ts — the repo-wide character roster.
 *
 * The publish pipeline writes ONE roster doc per line, `meta/characters_{line}`,
 * holding every character that line's comics stage and every version (life stage
 * or costume) each of them needs. A version nobody has drawn yet is IN the doc
 * with `drawn: false` and no key — that absence is the point of the surface, so
 * nothing here ever filters it out.
 *
 * Two rules this module exists to hold:
 *
 *   1. SURFACE SEPARATION. `manga-indic` is the manga surface; every other line
 *      is comics. A manga character must never appear in a comics-surface
 *      listing or the reverse. Enforced twice — once by only READING the roster
 *      docs of the lines in the active surface (`rosterLineSlugs`), and again by
 *      dropping any person whose own line resolves to the other surface
 *      (`selectCharacters`). The second pass is not redundant: it holds even if
 *      a roster doc is ever published with a person from another line in it.
 *
 *   2. IDENTITY IS (line, slug), NEVER slug ALONE. `manga/indic`'s Ram is a
 *      different character from Indic's Ram — different design, different book,
 *      different surface. Nothing here dedupes or merges across lines.
 */

import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isSurface, surfaceOfLineSlug, type Surface } from '@/lib/surface'
import type { Line } from '@/types/content'

// ─── The published contract ───────────────────────────────────────────────────

/** One version of a character: a life stage, or a costume the book needs. */
export interface RosterVersion {
  /** 'boy', 'prime-2010s', … or '—' when nothing is drawn yet. */
  stage: string
  drawn: boolean
  /** `artifacts/characters/{line}/{slug}/{stage}.png`, or null when undrawn. */
  key: string | null
  comics: { slug: string; title: string; pages: number[] }[]
  /** Page count across those comics — how much work waits on this version. */
  pages: number
}

export interface RosterPerson {
  slug: string
  name: string
  line: string
  /** True when ANY version is drawn. */
  drawn: boolean
  versions: RosterVersion[]
  pages: number
  comics: string[]
}

export interface RosterDoc {
  line: string
  surface: Surface
  count: number
  drawn: number
  owed: number
  versions: number
  versionsDrawn: number
  comics: number
  /** Drawn first, then by page count desc, as published. */
  people: RosterPerson[]
}

export const CHARACTER_ROSTER_PREFIX = 'characters_'

/** `biographies` → `characters_biographies`. */
export function rosterDocId(lineSlug: string): string {
  return `${CHARACTER_ROSTER_PREFIX}${lineSlug}`
}

// ─── Surface resolution ───────────────────────────────────────────────────────

/**
 * A roster's surface. Same resolution order as `surfaceOfLine`: the doc's own
 * declared value when it is one of the two, then the line-slug prefix.
 */
export function surfaceOfRoster(roster: Pick<RosterDoc, 'line' | 'surface'>): Surface {
  return isSurface(roster.surface) ? roster.surface : surfaceOfLineSlug(roster.line)
}

/**
 * The line slugs whose rosters belong to `surface` — i.e. the only docs the
 * Characters page is allowed to read. A null surface (not yet resolved) means
 * every line, matching how the home page and `catalog.ts` treat it.
 */
export function rosterLineSlugs(lines: Line[] | null, surface: Surface | null): string[] {
  const slugs = (lines ?? []).map((l) => l.slug)
  if (!surface) return slugs
  return slugs.filter((slug) => surfaceOfLineSlug(slug) === surface)
}

/** Stable identity for a character. Line-qualified, deliberately. */
export function characterId(person: Pick<RosterPerson, 'line' | 'slug'>): string {
  return `${person.line}/${person.slug}`
}

// ─── Selection ────────────────────────────────────────────────────────────────

export type DrawnFilter = 'all' | 'drawn' | 'owed'

export interface CharacterFilters {
  /** A line slug, or 'all'. */
  line?: string
  drawn?: DrawnFilter
  q?: string
}

/** Does this character still have art owed on them? */
export function isOwed(person: RosterPerson): boolean {
  return !person.drawn || person.versions.some((v) => !v.drawn)
}

/**
 * Flatten the rosters into one list, scoped to the surface and narrowed by the
 * filters. Sorted by page count desc then name — the most-used characters
 * first regardless of whether they are drawn, so the ones still owed are not
 * pushed to the bottom of a 795-strong list where nobody would find them.
 */
export function selectCharacters(
  rosters: RosterDoc[] | null,
  surface: Surface | null,
  filters: CharacterFilters = {},
): RosterPerson[] {
  const { line = 'all', drawn = 'all', q = '' } = filters
  const needle = q.trim().toLowerCase()
  const out: RosterPerson[] = []

  for (const roster of rosters ?? []) {
    // Pass 1: the roster's own surface.
    if (surface && surfaceOfRoster(roster) !== surface) continue

    for (const raw of roster.people ?? []) {
      // A person carries its own line; fall back to the roster's when absent so
      // an older doc still resolves rather than silently landing in 'comics'.
      const person: RosterPerson = { ...raw, line: raw.line || roster.line }

      // Pass 2: the PERSON's surface. Independent of pass 1 on purpose.
      if (surface && surfaceOfLineSlug(person.line) !== surface) continue

      if (line !== 'all' && person.line !== line) continue
      if (drawn === 'drawn' && !person.drawn) continue
      if (drawn === 'owed' && !isOwed(person)) continue
      if (needle) {
        const hay = `${person.name} ${person.slug}`.toLowerCase()
        if (!hay.includes(needle)) continue
      }
      out.push(person)
    }
  }

  return out.sort((a, b) => b.pages - a.pages || a.name.localeCompare(b.name))
}

export interface RosterTotals {
  characters: number
  drawn: number
  owed: number
  versions: number
  versionsDrawn: number
  comics: number
}

/**
 * Counts for whatever set is actually on screen. Recomputed from the people
 * rather than read off the doc headers, because a filtered list beside an
 * unfiltered total reads as a miscount (the same reason
 * `filterCoverageBySurface` recomputes its totals).
 */
export function rosterTotals(people: RosterPerson[]): RosterTotals {
  const comics = new Set<string>()
  let versions = 0
  let versionsDrawn = 0
  let drawn = 0
  for (const p of people) {
    if (p.drawn) drawn += 1
    for (const v of p.versions) {
      versions += 1
      if (v.drawn) versionsDrawn += 1
      for (const c of v.comics ?? []) comics.add(`${p.line}/${c.slug}`)
    }
    for (const slug of p.comics ?? []) comics.add(`${p.line}/${slug}`)
  }
  return {
    characters: people.length,
    drawn,
    owed: people.length - drawn,
    versions,
    versionsDrawn,
    comics: comics.size,
  }
}

/** Every resolvable image key across a set of characters, in render order. */
export function versionKeys(people: RosterPerson[]): string[] {
  const keys: string[] = []
  for (const p of people) {
    for (const v of p.versions) {
      if (v.key) keys.push(v.key)
    }
  }
  return keys
}

// ─── Reading the docs ─────────────────────────────────────────────────────────

export interface RosterLoad {
  data: RosterDoc[] | null
  loading: boolean
  error?: Error
}

/**
 * Read one roster doc per line slug. A line with no roster published yet is
 * simply absent from the result, and a single denied/failed read is swallowed
 * rather than blanking the whole page — one line a member cannot see must not
 * cost them the lines they can.
 */
export function useCharacterRosters(lineSlugs: string[]): RosterLoad {
  const [state, setState] = useState<RosterLoad>({ data: null, loading: true })
  // Key on the content, not the array identity, so a fresh array literal each
  // render does not re-fetch forever.
  const signature = [...lineSlugs].sort().join('|')

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ data: null, loading: true })

    if (lineSlugs.length === 0) {
      setState({ data: [], loading: false })
      return
    }

    Promise.all(
      lineSlugs.map(async (slug) => {
        try {
          const snap = await getDoc(doc(db, 'meta', rosterDocId(slug)))
          if (!snap.exists()) return null
          const data = snap.data() as RosterDoc
          return { ...data, line: data.line || slug }
        } catch {
          return null
        }
      }),
    )
      .then((docs) => {
        if (!active) return
        setState({ data: docs.filter((d): d is RosterDoc => d !== null), loading: false })
      })
      .catch((err) => {
        if (!active) return
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      })

    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return state
}

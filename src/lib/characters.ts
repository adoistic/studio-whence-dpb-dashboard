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
 * Three rules this module exists to hold:
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
 *
 *   3. SHARED IP IS ONE CHARACTER. Little Chanakya narrates every line; Pihu,
 *      Bali, Radha, Arjun and Gabboo are Diamond's design-locked "Little
 *      Chanakya & Friends" deck, staged by Awareness, MediComics and more. They
 *      have ONE locked design, so they are published ONCE, in a sixth doc
 *      `meta/characters_shared` whose `line` is `shared` and whose `surface` is
 *      `both`. Keying them per line made Pihu read as *drawn* under Awareness
 *      and *still to draw* under MediComics at the same time, because the art
 *      sits in the Awareness folder and MediComics could not see it.
 *
 * Rules 1 and 3 meet at `both`, and they do not fight. `both` is a THIRD value,
 * admitted by an explicit identity test — never by loosening `surfaceOfLineSlug`,
 * which still maps every real line slug to exactly one surface. So the shared
 * cast reaches both listings and `manga-indic` still cannot reach the comics one.
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

/**
 * What kind of thing this entry is.
 *
 *   `shared` — studio/Diamond IP with one locked design, used by many lines.
 *   `role`   — an unnamed walk-on (`Father · The Tangaywala…`), scoped to ONE
 *              comic. Merging roles across books claimed a single Student
 *              standing on 71 biography pages and 31 Indic pages.
 *   `line`   — a named character belonging to one line. The default, and what
 *              an older doc that carries no `kind` at all means.
 */
export type PersonKind = 'shared' | 'role' | 'line'

export interface RosterPerson {
  slug: string
  name: string
  line: string
  /** Absent on older docs; treat as `line` (or `shared` for the shared doc). */
  kind?: PersonKind
  /** Shared people only: the line slugs that actually stage them. */
  lines?: string[]
  /** True when ANY version is drawn. */
  drawn: boolean
  versions: RosterVersion[]
  pages: number
  /** Comic slugs. Line-qualified (`medicomics/01-…`) on the shared doc. */
  comics: string[]
}

export interface RosterDoc {
  line: string
  surface: RosterSurface
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

/** The pseudo-line the shared-IP doc is published under: `meta/characters_shared`. */
export const SHARED_LINE = 'shared'

/** `biographies` → `characters_biographies`; `shared` → `characters_shared`. */
export function rosterDocId(lineSlug: string): string {
  return `${CHARACTER_ROSTER_PREFIX}${lineSlug}`
}

// ─── Surface resolution ───────────────────────────────────────────────────────

/** A published roster sits on one surface, or — for shared IP — on both. */
export type RosterSurface = Surface | 'both'

export const BOTH_SURFACES = 'both'

/**
 * A roster's surface. Resolution order: `both` when the doc says so or when it
 * IS the shared doc, then the doc's own declared surface when it is one of the
 * two, then the line-slug prefix.
 *
 * `both` is deliberately a value of its own rather than a hole in
 * `surfaceOfLineSlug`. Only the shared doc can carry it, and no real line slug
 * can ever produce it.
 */
export function surfaceOfRoster(roster: Pick<RosterDoc, 'line' | 'surface'>): RosterSurface {
  if (roster.surface === BOTH_SURFACES || roster.line === SHARED_LINE) return BOTH_SURFACES
  return isSurface(roster.surface) ? roster.surface : surfaceOfLineSlug(roster.line)
}

/** Does this roster belong in `surface`'s listing? A `both` roster always does. */
export function rosterOnSurface(
  roster: Pick<RosterDoc, 'line' | 'surface'>,
  surface: Surface | null,
): boolean {
  if (!surface) return true
  const s = surfaceOfRoster(roster)
  return s === BOTH_SURFACES || s === surface
}

/** Studio/Diamond IP: one locked design, many lines, one entry. */
export function isSharedPerson(person: Pick<RosterPerson, 'line' | 'kind'>): boolean {
  return person.kind === 'shared' || person.line === SHARED_LINE
}

/** What kind of entry this is, with the default an older doc implies. */
export function personKind(person: Pick<RosterPerson, 'line' | 'kind'>): PersonKind {
  if (isSharedPerson(person)) return 'shared'
  return person.kind === 'role' ? 'role' : 'line'
}

/**
 * The line slugs that actually stage this character — several for shared IP,
 * exactly one for everybody else. Never `shared` itself, which is a filing
 * location and not a line anyone browses.
 */
export function personLines(person: Pick<RosterPerson, 'line' | 'lines' | 'kind'>): string[] {
  if (isSharedPerson(person)) return person.lines ?? []
  return person.line ? [person.line] : []
}

/**
 * Does this person belong in `surface`'s listing?
 *
 * Shared IP does, on both — Little Chanakya narrates the studio, and a second
 * copy of him filed under a manga line is exactly the duplication the shared
 * doc exists to end. Everyone else is resolved from their own line slug, so
 * the manga/comics split is untouched.
 */
export function personOnSurface(
  person: Pick<RosterPerson, 'line' | 'kind'>,
  surface: Surface | null,
): boolean {
  if (!surface) return true
  if (isSharedPerson(person)) return true
  return surfaceOfLineSlug(person.line) === surface
}

/**
 * The roster docs the Characters page may read for `surface`: that surface's
 * lines, plus the shared doc, which belongs to every surface. A null surface
 * (not yet resolved) means every line, matching how the home page and
 * `catalog.ts` treat it.
 */
export function rosterLineSlugs(lines: Line[] | null, surface: Surface | null): string[] {
  const slugs = (lines ?? [])
    .map((l) => l.slug)
    .filter((slug) => slug !== SHARED_LINE && (!surface || surfaceOfLineSlug(slug) === surface))
  return [...slugs, SHARED_LINE]
}

/** Stable identity for a character. Line-qualified, deliberately. */
export function characterId(person: Pick<RosterPerson, 'line' | 'slug'>): string {
  return `${person.line}/${person.slug}`
}

/**
 * A comic slug qualified by the line that publishes it, so two lines' books
 * never collapse into one count or one link. The shared doc already writes its
 * person-level slugs qualified; its VERSION-level ones are bare, and are
 * resolved against the qualified list.
 */
export function qualifyComic(person: RosterPerson, slug: string): string | null {
  if (slug.includes('/')) return slug
  if (!isSharedPerson(person)) return person.line ? `${person.line}/${slug}` : null
  const match = (person.comics ?? []).find((c) => c.endsWith(`/${slug}`))
  return match ?? null
}

/** `/{line}/{comic}` for a version's comic, or null when the line is unknown. */
export function comicHref(person: RosterPerson, slug: string): string | null {
  const qualified = qualifyComic(person, slug)
  return qualified ? `/${qualified}` : null
}

// ─── Selection ────────────────────────────────────────────────────────────────

export type DrawnFilter = 'all' | 'drawn' | 'owed'

/**
 * `named` is everything that is a person — line-owned characters and shared IP
 * alike — as against `role`, the unnamed walk-ons. Roles now outnumber names in
 * the biographies list, so separating them is what makes that list readable.
 */
export type KindFilter = 'all' | 'named' | 'shared' | 'role'

export interface CharacterFilters {
  /** A line slug, or 'all'. Matches any line a shared character is staged by. */
  line?: string
  drawn?: DrawnFilter
  kind?: KindFilter
  q?: string
}

export function matchesKind(person: RosterPerson, filter: KindFilter): boolean {
  if (filter === 'all') return true
  const kind = personKind(person)
  if (filter === 'named') return kind !== 'role'
  return kind === filter
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
  const { line = 'all', drawn = 'all', kind = 'all', q = '' } = filters
  const needle = q.trim().toLowerCase()
  const out: RosterPerson[] = []

  // Which (line, slug) pairs the shared doc has already accounted for. The
  // publish drops them from the line docs, but a deploy and a publish are not
  // the same event: a line doc written before the split still carries Little
  // Chanakya, and rendering both copies is the duplication being fixed. Scoped
  // to the lines the shared entry itself claims, so a line-owned character who
  // merely SHARES A SLUG with shared IP is never suppressed — identity is
  // (line, slug), and this stays true to that.
  const superseded = new Set<string>()
  for (const roster of rosters ?? []) {
    if (surfaceOfRoster(roster) !== BOTH_SURFACES) continue
    for (const p of roster.people ?? []) {
      for (const l of personLines(p)) superseded.add(`${l}/${p.slug}`)
    }
  }

  const seen = new Set<string>()
  for (const roster of rosters ?? []) {
    // Pass 1: the roster's own surface. A `both` roster passes either.
    if (!rosterOnSurface(roster, surface)) continue

    for (const raw of roster.people ?? []) {
      // A person carries its own line; fall back to the roster's when absent so
      // an older doc still resolves rather than silently landing in 'comics'.
      const person: RosterPerson = { ...raw, line: raw.line || roster.line }

      // Pass 2: the PERSON's surface. Independent of pass 1 on purpose.
      if (!personOnSurface(person, surface)) continue

      // One entry per character, whichever doc carries it.
      const id = characterId(person)
      if (seen.has(id)) continue
      if (!isSharedPerson(person) && superseded.has(id)) continue
      seen.add(id)

      // A shared character is matched against every line that stages them, so
      // "Awareness" still finds Pihu even though her doc is filed under `shared`.
      if (line !== 'all' && !personLines(person).includes(line)) continue
      if (!matchesKind(person, kind)) continue
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
      // Line-qualified, so two lines' books never collapse into one count —
      // and so a shared character's MediComics book counts as the same book a
      // MediComics-owned character stages, rather than as a second one.
      for (const c of v.comics ?? []) comics.add(qualifyComic(p, c.slug) ?? `${p.line}/${c.slug}`)
    }
    for (const slug of p.comics ?? []) comics.add(qualifyComic(p, slug) ?? `${p.line}/${slug}`)
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
 * Read one roster doc per slug — the surface's lines, plus `shared`. A line with
 * no roster published yet is simply absent from the result, and a single
 * denied/failed read is swallowed rather than blanking the whole page: one line
 * a member cannot see must not cost them the lines they can, and a portal where
 * the shared doc has not been published yet must still list the line casts.
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

'use client'

/**
 * kit.ts — the brand kit: the logos, products and places a comic must draw right.
 *
 * The sibling of `characters.ts`, and deliberately the same shape, because a mark
 * and a character are the same kind of object here: a locked asset with versions,
 * some drawn and some still owed, that a page attaches by name.
 *
 * The publish pipeline writes ONE doc per cast domain, `meta/kit_{domain}`.
 *
 * Two things this module holds that a logo gallery would not:
 *
 *   1. AN ERA IS THE VERSION. A mark is a property of the YEAR, not of the
 *      company — Apple's mark carried a wordmark until 1984 and stood alone
 *      after it, Microsoft's changed four times, Google's five. So an era is
 *      modelled exactly as a character's life stage is, and a page picks one by
 *      the year it is set in. Rendering a mark without its era would reproduce
 *      the anachronism the kit exists to prevent.
 *
 *   2. `verified` IS NOT `drawn`. A drawn era has a sheet on disk. A VERIFIED
 *      era is one whose dates somebody checked against a dated artefact. Most
 *      are drawn and unverified, and the surface says so plainly rather than
 *      letting a plausible date read as researched.
 *
 * No artwork ships in this public repo. Every sheet is an R2 key resolved to a
 * short-lived signed URL at view time, behind the same auth gate as everything
 * else.
 */

import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── The published contract ───────────────────────────────────────────────────

/** One form of a mark, current for a span of years. */
export interface KitEra {
  /** `rainbow-1984-1998`, `beige-1984-1990`, … */
  slug: string
  from: number | null
  /** null means "still current". */
  to: number | null
  /** Prose description of the form, shown to whoever draws or checks the page. */
  form: string
  /** Has anyone confirmed these dates against a dated artefact? */
  verified: boolean
  /** True when the real asset was clean vector and was taken as-is, not redrawn. */
  adopted: boolean
  drawn: boolean
  /** `artifacts/kit/{domain}/{mark}/{era}.png`, or null when undrawn. */
  key: string | null
}

export type MarkKind = 'logo' | 'product' | 'building'

export interface KitMark {
  slug: string
  name: string
  /** Absent on an older doc; treat as `logo`. */
  kind?: MarkKind
  eras: KitEra[]
  /** Pages across the domain whose art direction draws this mark. */
  pages: number
  /** Book slugs those pages belong to. */
  books: string[]
  /** [earliest, latest] year staged, or null when no page states a year. */
  yearSpan: [number, number] | null
}

export interface KitDoc {
  domain: string
  line: string
  surface: string
  count: number
  erasDrawn: number
  erasOwed: number
  marks: KitMark[]
}

export const KIT_DOC_PREFIX = 'kit_'

/** `tech` → `kit_tech`. */
export function kitDocId(domain: string): string {
  return `${KIT_DOC_PREFIX}${domain}`
}

/**
 * The cast domains that can carry a kit. Listing them rather than discovering
 * them keeps one missing doc from being indistinguishable from a fetch failure —
 * a domain with no kit yet reads as "not started", which is true and useful.
 */
export const KIT_DOMAINS = [
  'tech', 'business', 'cricket', 'science', 'bollywood',
  'historical', 'football', 'tennis',
] as const

export type KitDomain = (typeof KIT_DOMAINS)[number]

// ─── Reading ──────────────────────────────────────────────────────────────────

export function markKind(m: KitMark): MarkKind {
  return m.kind ?? 'logo'
}

/** Human label for an era's span: `1984–1998`, `2013–now`, `—`. */
export function eraSpan(e: KitEra): string {
  if (e.from == null && e.to == null) return '—'
  return `${e.from ?? '?'}–${e.to ?? 'now'}`
}

/** Which era covers a given year, or null. Mirrors the page-prompt builder. */
export function eraForYear(m: KitMark, year: number): KitEra | null {
  for (const e of m.eras) {
    if (e.from != null && year < e.from) continue
    if (e.to != null && year > e.to) continue
    return e
  }
  return null
}

export interface KitFilters {
  kind?: MarkKind | 'all'
  /** `drawn` / `owed` / `unverified`, or all. */
  state?: 'all' | 'drawn' | 'owed' | 'unverified'
  query?: string
}

export interface KitTotals {
  marks: number
  eras: number
  drawn: number
  owed: number
  unverified: number
  pages: number
}

export function kitTotals(docs: KitDoc[]): KitTotals {
  const t: KitTotals = { marks: 0, eras: 0, drawn: 0, owed: 0, unverified: 0, pages: 0 }
  for (const d of docs) {
    for (const m of d.marks) {
      t.marks += 1
      t.pages += m.pages
      for (const e of m.eras) {
        t.eras += 1
        if (e.drawn) t.drawn += 1
        else t.owed += 1
        if (!e.verified) t.unverified += 1
      }
    }
  }
  return t
}

/**
 * Marks matching the filters, ordered by how much work rides on them: most
 * demanded first, then alphabetically. An owed mark is never filtered out by the
 * default view — what is missing is the reason to open this tab.
 */
export function selectMarks(docs: KitDoc[], f: KitFilters = {}): (KitMark & { domain: string })[] {
  const q = (f.query ?? '').trim().toLowerCase()
  const out: (KitMark & { domain: string })[] = []
  for (const d of docs) {
    for (const m of d.marks) {
      if (f.kind && f.kind !== 'all' && markKind(m) !== f.kind) continue
      if (f.state === 'drawn' && !m.eras.some((e) => e.drawn)) continue
      if (f.state === 'owed' && !m.eras.some((e) => !e.drawn)) continue
      if (f.state === 'unverified' && !m.eras.some((e) => !e.verified)) continue
      if (q && !(m.name.toLowerCase().includes(q) || m.slug.includes(q)
        || m.books.some((b) => b.includes(q)))) continue
      out.push({ ...m, domain: d.domain })
    }
  }
  return out.sort((a, b) => b.pages - a.pages || a.name.localeCompare(b.name))
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Every published kit doc. A domain with no doc is simply absent — it has no kit
 * yet, which is a true and useful thing for the surface to show.
 */
export function useKitDocs(): { docs: KitDoc[]; loading: boolean; error: string | null } {
  const [docs, setDocs] = useState<KitDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const got = await Promise.all(
          KIT_DOMAINS.map(async (d) => {
            try {
              const snap = await getDoc(doc(db, 'meta', kitDocId(d)))
              return snap.exists() ? (snap.data() as KitDoc) : null
            } catch {
              return null
            }
          }),
        )
        if (!cancelled) setDocs(got.filter((d): d is KitDoc => !!d && Array.isArray(d.marks)))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the kit')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { docs, loading, error }
}

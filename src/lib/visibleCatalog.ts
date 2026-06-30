'use client'

import { useEffect, useState } from 'react'
import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { normalizeEmail } from '@/lib/admin'
import type { Allocation } from '@/lib/allocation'
import type { Comic, Figure } from '@/types/content'

// ─── Shared async one-shot (mirrors catalog.ts useAsync) ─────────────────────────

export interface Async<T> { data: T | null; loading: boolean; error?: Error }

function useAsync<T>(run: () => Promise<T>, deps: unknown[]): Async<T> {
  const [s, setS] = useState<Async<T>>({ data: null, loading: true })
  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setS({ data: null, loading: true })
    run()
      .then((data) => { if (active) setS({ data, loading: false }) })
      .catch((err) => { if (active) setS({ data: null, loading: false, error: err instanceof Error ? err : new Error(String(err)) }) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return s
}

const listData = <T,>(snap: { docs: { data: () => unknown }[] }): T[] => snap.docs.map((d) => d.data() as T)

// ─── chunk ──────────────────────────────────────────────────────────────────────
//
// Firestore `in` / `documentId() in` filters accept at most 30 values, so a grant
// list longer than that must be split into ≤30-value queries and the results
// merged. An empty input yields no chunks (so no query runs).

export function chunk<T>(arr: T[], size = 30): T[][] {
  if (size < 1) throw new Error('chunk size must be ≥ 1')
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ─── Allocation read (one-shot, no hook — used inside the async runners) ─────────
//
// Mirrors allocation.ts's read shape but as a plain async call so it composes
// inside useAsync. A missing doc maps to an all-empty allocation.

async function readAllocation(email: string): Promise<Allocation> {
  const norm = normalizeEmail(email)
  const snap = await getDoc(doc(db, 'allocations', norm))
  const empty: Allocation = { email: norm, lines: [], figures: [], comics: [], programs: [], figures_effective: [] }
  if (!snap.exists()) return empty
  const d = snap.data() as Partial<Allocation>
  return {
    email: norm,
    lines: d.lines ?? [],
    figures: d.figures ?? [],
    comics: d.comics ?? [],
    programs: d.programs ?? [],
    figures_effective: d.figures_effective ?? [],
  }
}

// ─── useVisibleComics ─────────────────────────────────────────────────────────────
//
// The comic set the viewer may actually read, aligned to the Firestore rules so
// no list query is rejected for containing an unreadable doc.
//
//   moderator → full `getDocs(collection('comics'))` scan (unchanged from useComics()).
//   member    → read the allocation, then run one chunked query per non-empty
//               grant set, each predicate honored by the rules, and union+dedupe:
//                 - where('line','in', chunk(lines))
//                 - where('subject_slug','in', chunk(figures))   ← RAW figures
//                 - where(documentId(),'in', chunk(comics))
//               No allocation / all-empty → [].

export function useVisibleComics(
  canModerate: boolean,
  email: string | null,
  refreshKey = 0,
): Async<Comic[]> {
  return useAsync<Comic[]>(async () => {
    if (canModerate) {
      return listData<Comic>(await getDocs(collection(db, 'comics')))
    }
    if (!email) return []

    const alloc = await readAllocation(email)
    if (alloc.lines.length === 0 && alloc.figures.length === 0
        && alloc.comics.length === 0 && alloc.programs.length === 0) {
      return []
    }

    const comicsCol = collection(db, 'comics')
    const runs: Promise<Comic[]>[] = []
    for (const c of chunk(alloc.lines)) {
      runs.push(getDocs(query(comicsCol, where('line', 'in', c))).then(listData<Comic>))
    }
    for (const c of chunk(alloc.figures)) {
      runs.push(getDocs(query(comicsCol, where('subject_slug', 'in', c))).then(listData<Comic>))
    }
    for (const c of chunk(alloc.comics)) {
      runs.push(getDocs(query(comicsCol, where(documentId(), 'in', c))).then(listData<Comic>))
    }
    for (const c of chunk(alloc.programs)) {
      runs.push(getDocs(query(comicsCol, where('program_slug', 'in', c))).then(listData<Comic>))
    }

    const byId = new Map<string, Comic>()
    for (const batch of await Promise.all(runs)) {
      for (const comic of batch) byId.set(`${comic.line}__${comic.slug}`, comic)
    }
    return Array.from(byId.values())
    // canModerate + email are the only inputs; refreshKey forces a manual reload.
  }, [canModerate, email, refreshKey])
}

// ─── useVisibleFigures ─────────────────────────────────────────────────────────────
//
// The figure/research set the viewer may read.
//
//   moderator → full `getDocs(collection('figures'))` scan (unchanged from useFigures()).
//   member    → figures whose doc id (== subject slug) ∈ figures_effective, plus
//               (once figure docs carry a `line` field) figures whose line ∈ lines.
//               Union+dedupe by slug. No grants → [].
//
// Figure docs are keyed by subject slug (content repo: tools/firestore_catalog.py
// writes `figures/{slug}`), so the documentId() filter targets the slug directly.
// Figure docs carry a `line` field (written by the content publish pipeline), so
// the line branch resolves the figures of any line the member holds via `lines`;
// a member viewing a line they only hold via `lines` still reaches each figure's
// page (where `useFigure` is a single allocated read).

export function useVisibleFigures(
  canModerate: boolean,
  email: string | null,
  refreshKey = 0,
): Async<Figure[]> {
  return useAsync<Figure[]>(async () => {
    if (canModerate) {
      return listData<Figure>(await getDocs(collection(db, 'figures')))
    }
    if (!email) return []

    const alloc = await readAllocation(email)
    if (alloc.figures_effective.length === 0 && alloc.lines.length === 0
        && alloc.programs.length === 0) {
      return []
    }

    const figuresCol = collection(db, 'figures')
    const runs: Promise<Figure[]>[] = []
    for (const c of chunk(alloc.figures_effective)) {
      runs.push(getDocs(query(figuresCol, where(documentId(), 'in', c))).then(listData<Figure>))
    }
    for (const c of chunk(alloc.lines)) {
      runs.push(getDocs(query(figuresCol, where('line', 'in', c))).then(listData<Figure>))
    }
    for (const c of chunk(alloc.programs)) {
      runs.push(getDocs(query(figuresCol, where('program_slug', 'in', c))).then(listData<Figure>))
    }

    const bySlug = new Map<string, Figure>()
    for (const batch of await Promise.all(runs)) {
      for (const figure of batch) bySlug.set(figure.slug, figure)
    }
    return Array.from(bySlug.values())
  }, [canModerate, email, refreshKey])
}

// ─── useOpenFigures ─────────────────────────────────────────────────────────────
//
// The `openResearch:true` figures of a line (the medicomics disease model). Any
// allowlisted member may read these under the figures rule's `openResearch`
// allowance, with NO specific allocation. Both filters are equality, so the
// query uses Firestore's automatic single-field indexes — no composite index.
//
// Used to MERGE open figures into a line page for a member who isn't allocated
// the line. Moderators already get every figure via useVisibleFigures, so a
// merge keyed by slug must not double-count (the caller dedupes by slug).

export function useOpenFigures(line: string): Async<Figure[]> {
  return useAsync<Figure[]>(async () => {
    if (!line) return []
    const snap = await getDocs(
      query(collection(db, 'figures'), where('line', '==', line), where('openResearch', '==', true)),
    )
    return listData<Figure>(snap)
  }, [line])
}

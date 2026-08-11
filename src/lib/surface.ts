'use client'

import { useCallback, useEffect, useState } from 'react'
import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { normalizeEmail } from '@/lib/admin'
import { chunk } from '@/lib/visibleCatalog'
import type { AllowStatus } from '@/lib/auth'
import type { Allocation } from '@/lib/allocation'
import type { Coverage, CoverageLine, Figure, Line } from '@/types/content'

// ─── What a surface is ────────────────────────────────────────────────────────
//
// The portal carries two bodies of work that should not be browsed together:
// the comics (everything built to date) and the manga (the Ramayana saga first,
// then Hanuman, then biography manga). A surface is a browsing filter over what
// a person may ALREADY see — never a permission. Access decisions stay entirely
// with the allocation + the Firestore rules, which this file does not touch.

export type Surface = 'comics' | 'manga'

export const SURFACES: readonly Surface[] = ['comics', 'manga'] as const

export const SURFACE_LABEL: Record<Surface, string> = {
  comics: 'Comics',
  manga: 'Manga',
}

export const SURFACE_BLURB: Record<Surface, string> = {
  comics: 'Every comic line in production, with research, scripts and finished pages.',
  manga: 'The manga saga, in volumes.',
}

export function isSurface(v: unknown): v is Surface {
  return v === 'comics' || v === 'manga'
}

// ─── A line declares the surface; everything beneath it inherits ──────────────
//
// One field in one place, so a new manga line is a one-line change and no comic
// doc, figure doc or allocation ever has to be rewritten.
//
// Resolution order: the line doc's own `surface`, then this fallback map, then
// 'comics'. The fallback exists so the split can ship before the publish
// pipeline stamps the field, and because a line slug is structure rather than
// IP — the same reason the line visuals already live in this public repo.

// A category IS a line, and a line belongs to a surface. Manga categories are
// named `manga-<category>`, so the surface is readable straight off the slug and
// adding a category tomorrow — manga-biographies, manga-originals — needs no
// change here at all. Each surface owns its own category namespace, so both can
// carry an "Indic" without sharing a key, and a category can exist on one
// surface and not the other.
export const MANGA_LINE_PREFIX = 'manga-'

export function surfaceOfLineSlug(slug: string | null | undefined): Surface {
  if (!slug) return 'comics'
  return slug.startsWith(MANGA_LINE_PREFIX) ? 'manga' : 'comics'
}

/** The category part of a line slug: `manga-indic` → `indic`. */
export function categoryOfLineSlug(slug: string): string {
  return slug.startsWith(MANGA_LINE_PREFIX) ? slug.slice(MANGA_LINE_PREFIX.length) : slug
}

export function surfaceOfLine(line: Pick<Line, 'slug'> & { surface?: string }): Surface {
  if (isSurface(line.surface)) return line.surface
  return surfaceOfLineSlug(line.slug)
}

/** Index a loaded line list once, then resolve slugs against it. */
export function surfaceIndex(lines: Line[] | null | undefined): (slug: string | null | undefined) => Surface {
  const byLine = new Map<string, Surface>()
  const byProgram = new Map<string, Surface>()
  for (const line of lines ?? []) {
    const s = surfaceOfLine(line)
    byLine.set(line.slug, s)
    for (const program of line.programs ?? []) byProgram.set(program.slug, s)
  }
  return (slug) => {
    if (!slug) return 'comics'
    return byLine.get(slug) ?? byProgram.get(slug) ?? surfaceOfLineSlug(slug)
  }
}

// ─── Deriving a member's surfaces from their grants ───────────────────────────
//
// Derived, never granted. Nobody can hold a manga title and then be unable to
// reach it because a second switch was left off, and the split can only ever
// narrow what is shown, never widen it.
//
//   allocation.lines     → the line slug directly
//   allocation.programs  → the line that owns the program (from the line docs)
//   allocation.comics    → Firestore ids of the form `{line}__{slug}`
//   allocation.figures   → the figure doc's `line` (resolved by the caller)

export function lineOfComicId(id: string): string {
  const i = id.indexOf('__')
  return i === -1 ? id : id.slice(0, i)
}

export function surfacesFromGrants(
  alloc: Pick<Allocation, 'lines' | 'programs' | 'comics'>,
  resolve: (slug: string | null | undefined) => Surface,
  extraLines: string[] = [],
): Surface[] {
  const found = new Set<Surface>()
  for (const slug of alloc.lines) found.add(resolve(slug))
  for (const slug of alloc.programs) found.add(resolve(slug))
  for (const id of alloc.comics) found.add(resolve(lineOfComicId(id)))
  for (const slug of extraLines) found.add(resolve(slug))
  return SURFACES.filter((s) => found.has(s))
}

// ─── The sub-admin surface scope ──────────────────────────────────────────────
//
// `allowlist/{email}.surfaces` optionally narrows a sub_admin to one surface.
// ABSENT MEANS BOTH — every sub-admin who exists today has no such field, so
// they all keep full moderation over both surfaces with no migration. The field
// only ever appears when someone is deliberately scoped.

export function parseSurfaceScope(raw: unknown): Surface[] | null {
  if (!Array.isArray(raw)) return null
  const scoped = SURFACES.filter((s) => raw.includes(s))
  return scoped.length > 0 ? scoped : null
}

async function readSurfaceScope(email: string): Promise<Surface[] | null> {
  const snap = await getDoc(doc(db, 'allowlist', normalizeEmail(email)))
  if (!snap.exists()) return null
  return parseSurfaceScope(snap.data()?.surfaces)
}

// ─── useAvailableSurfaces ─────────────────────────────────────────────────────
//
//   admin      → both, always
//   sub_admin  → its scope if it has one, else both
//   member     → the surfaces its allocation actually spans
//
// Returns `null` while loading so callers can tell "not yet known" from "none".

export function useAvailableSurfaces(
  status: AllowStatus,
  email: string | null,
  lines: Line[] | null,
): { data: Surface[] | null; loading: boolean } {
  const [state, setState] = useState<{ data: Surface[] | null; loading: boolean }>({
    data: null,
    loading: true,
  })

  const key = `${status}|${email ?? ''}|${lines ? lines.length : -1}`

  useEffect(() => {
    if (status === 'loading' || !email) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ data: null, loading: true })
      return
    }
    if (status === 'admin') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ data: [...SURFACES], loading: false })
      return
    }
    // The line list is what resolves a program or comic grant to a surface.
    if (!lines) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ data: null, loading: true })
      return
    }

    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ data: null, loading: true })

    const resolve = surfaceIndex(lines)

    const run = async (): Promise<Surface[]> => {
      if (status === 'sub_admin') {
        return (await readSurfaceScope(email)) ?? [...SURFACES]
      }

      const norm = normalizeEmail(email)
      const snap = await getDoc(doc(db, 'allocations', norm))
      if (!snap.exists()) return []
      const d = snap.data() as Partial<Allocation>
      const alloc = {
        lines: d.lines ?? [],
        programs: d.programs ?? [],
        comics: d.comics ?? [],
      }

      let found = surfacesFromGrants(alloc, resolve)
      if (found.length > 0) return found

      // Figure-only grant: the figure docs carry `line`, so resolve them. This
      // runs only when nothing else produced a surface, which keeps the common
      // case to a single document read.
      const figures = d.figures_effective ?? d.figures ?? []
      if (figures.length === 0) return []
      const runs = chunk(figures).map((c) =>
        getDocs(query(collection(db, 'figures'), where(documentId(), 'in', c)))
          .then((s) => s.docs.map((x) => (x.data() as Figure).line ?? null)),
      )
      const figureLines = (await Promise.all(runs)).flat().filter((l): l is string => Boolean(l))
      found = surfacesFromGrants(alloc, resolve, figureLines)
      return found
    }

    run()
      .then((data) => { if (active) setState({ data, loading: false }) })
      // Fail closed to "no surfaces" rather than guessing: the caller renders
      // its existing empty state, and no content is shown that shouldn't be.
      .catch(() => { if (active) setState({ data: [], loading: false }) })

    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}

// ─── Narrowing the coverage roll-up to one surface ────────────────────────────
//
// meta/coverage is published whole. Showing its unfiltered totals beside a
// filtered line list would read as a miscount, so the totals are recomputed from
// the lines that survive the filter. Pure, so it can be tested without Firestore.

export function filterCoverageBySurface(
  coverage: Coverage,
  surface: Surface | null,
  resolve: (slug: string | null | undefined) => Surface,
): Coverage {
  if (!surface) return coverage
  const lines = coverage.lines.filter((l) => resolve(l.slug) === surface)
  if (lines.length === coverage.lines.length) return coverage
  const sum = (pick: (l: CoverageLine) => number) => lines.reduce((n, l) => n + pick(l), 0)
  return {
    ...coverage,
    lines,
    totals: {
      lines: lines.length,
      figures: sum((l) => l.figures),
      comics: sum((l) => l.comics.total),
      published: sum((l) => l.comics.published),
      approved: sum((l) => l.comics.approved),
      in_review: sum((l) => l.comics.in_review),
      draft: sum((l) => l.comics.draft),
    },
  }
}

// ─── The active surface (per browser) ─────────────────────────────────────────

export const ACTIVE_SURFACE_KEY = 'sw.surface'

export function readStoredSurface(): Surface | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ACTIVE_SURFACE_KEY)
    return isSurface(raw) ? raw : null
  } catch {
    return null
  }
}

function writeStoredSurface(surface: Surface): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ACTIVE_SURFACE_KEY, surface)
  } catch {
    // A browser with storage disabled just gets the chooser every visit.
  }
}

// ── One shared value, not one per component ──────────────────────────────────
//
// The active surface is global state, so it lives in a module-level store that
// every hook instance subscribes to. It must NOT be per-component useState:
// when the chooser saved a pick, only the chooser's own copy updated, the
// layout's copy stayed null, and the layout — seeing both surfaces available
// and no choice made — redirected straight back to the chooser. Every click
// bounced to /choose for anyone holding both surfaces.

let storeValue: Surface | null = null
let storeLoaded = false
const storeListeners = new Set<() => void>()

function notifyStore(): void {
  for (const listener of storeListeners) listener()
}

/** Read localStorage once, lazily, on the client. */
function loadStoreOnce(): void {
  if (storeLoaded) return
  storeValue = readStoredSurface()
  storeLoaded = true
}

/** Test seam: drop the module state so each test starts clean. */
export function __resetSurfaceStore(): void {
  storeValue = null
  storeLoaded = false
  storeListeners.clear()
}

/**
 * The surface currently being browsed, shared across every component that asks.
 * `null` until the first read resolves — on a static export the value exists
 * only client-side, so it is read in an effect and never during render.
 */
export function useActiveSurface(): {
  surface: Surface | null
  ready: boolean
  setSurface: (s: Surface) => void
} {
  const [, forceRender] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadStoreOnce()
    const rerender = () => forceRender((n) => n + 1)
    storeListeners.add(rerender)

    // Keep other tabs in step. Same-tab writes go through the store directly,
    // because the storage event does not fire in the tab that wrote it — which
    // is precisely why a listener alone could never have fixed this.
    function onStorage(e: StorageEvent) {
      if (e.key !== ACTIVE_SURFACE_KEY) return
      storeValue = isSurface(e.newValue) ? e.newValue : null
      storeLoaded = true
      notifyStore()
    }
    window.addEventListener('storage', onStorage)

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true)
    return () => {
      storeListeners.delete(rerender)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const setSurface = useCallback((s: Surface) => {
    writeStoredSurface(s)
    storeValue = s
    storeLoaded = true
    notifyStore()
  }, [])

  return { surface: ready ? storeValue : null, ready, setSurface }
}

/**
 * The surface to browse in, given what is available. Resolves to the stored
 * choice when it is still available, to the only available surface when there
 * is exactly one, and to `null` when a choice is owed.
 */
export function resolveActiveSurface(
  stored: Surface | null,
  available: Surface[] | null,
): Surface | null {
  if (!available || available.length === 0) return null
  if (available.length === 1) return available[0]
  if (stored && available.includes(stored)) return stored
  return null
}

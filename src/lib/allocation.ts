'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { normalizeEmail } from '@/lib/admin'

// ─── Shared async one-shot (mirrors catalog.ts / admin.ts useAsync) ───────────────

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

// ─── Types ─────────────────────────────────────────────────────────────────────────

export interface Allocation {
  email: string
  lines: string[]
  figures: string[]
  comics: string[]
  figures_effective: string[]
}

/** The raw, admin-facing grant triple (no derived field). */
export interface Grants { lines: string[]; figures: string[]; comics: string[] }

// ─── Derivation ──────────────────────────────────────────────────────────────────

/**
 * `figures_effective = figures ∪ { subject_slug(c) : c ∈ comics }`.
 * A granted comic implies its figure's full research library; comics whose
 * subject isn't known (missing from the map) are dropped. The result is
 * deduped and preserves first-seen order (figures first, then comic-implied).
 */
export function deriveEffectiveFigures(
  figures: string[],
  comics: string[],
  subjectByComic: Record<string, string | undefined>,
): string[] {
  return Array.from(new Set([
    ...figures,
    ...comics.map((c) => subjectByComic[c]).filter((s): s is string => Boolean(s)),
  ]))
}

// ─── Read hook (one-shot; component bumps refreshKey to reload after a write) ─────

const EMPTY_GRANT = (email: string): Allocation =>
  ({ email, lines: [], figures: [], comics: [], figures_effective: [] })

/**
 * Read a member's allocation. A missing doc maps to an empty-grant object (NOT
 * null) so the UI can render "no grants yet"; a null email maps to null.
 */
export function useAllocation(email: string | null, refreshKey = 0): Async<Allocation | null> {
  return useAsync<Allocation | null>(async () => {
    if (!email) return null
    const norm = normalizeEmail(email)
    const snap = await getDoc(doc(db, 'allocations', norm))
    if (!snap.exists()) return EMPTY_GRANT(norm)
    const d = snap.data() as Partial<Allocation>
    return {
      email: norm,
      lines: d.lines ?? [],
      figures: d.figures ?? [],
      comics: d.comics ?? [],
      figures_effective: d.figures_effective ?? [],
    }
  }, [email, refreshKey])
}

// ─── Mutation ────────────────────────────────────────────────────────────────────

/**
 * Full-overwrite write of a member's allocation doc. The admin UI always sends
 * the complete grant set; `figures_effective` is derived here from the catalog
 * map so the rules stay a single cheap scalar `hasAny()`.
 */
export async function setGrants(
  email: string,
  grants: Grants,
  opts: { adminEmail: string; subjectByComic: Record<string, string | undefined> },
): Promise<void> {
  const { lines, figures, comics } = grants
  const figures_effective = deriveEffectiveFigures(figures, comics, opts.subjectByComic)
  await setDoc(doc(db, 'allocations', normalizeEmail(email)), {
    lines,
    figures,
    comics,
    figures_effective,
    updatedBy: opts.adminEmail,
    updatedAt: serverTimestamp(),
  })
}

// ─── Pure grant-list helpers (so the UI doesn't duplicate set logic) ──────────────

const listFor = (kind: 'line' | 'figure' | 'comic'): keyof Grants =>
  kind === 'line' ? 'lines' : kind === 'figure' ? 'figures' : 'comics'

/** Add a grant to the right raw list if absent; returns the new grant triple. */
export function addGrant(
  alloc: Allocation,
  kind: 'line' | 'figure' | 'comic',
  value: string,
): Grants {
  const base: Grants = { lines: [...alloc.lines], figures: [...alloc.figures], comics: [...alloc.comics] }
  const key = listFor(kind)
  if (!base[key].includes(value)) base[key] = [...base[key], value]
  return base
}

/** Remove a grant from the right raw list; returns the new grant triple. */
export function removeGrant(
  alloc: Allocation,
  kind: 'line' | 'figure' | 'comic',
  value: string,
): Grants {
  const base: Grants = { lines: [...alloc.lines], figures: [...alloc.figures], comics: [...alloc.comics] }
  const key = listFor(kind)
  base[key] = base[key].filter((v) => v !== value)
  return base
}

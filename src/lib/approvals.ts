'use client'

/**
 * Diamond sign-off — one approval per deliverable, not one for the whole book.
 *
 * A book is not approved in a single act: the script lands, then the dossier,
 * then the interior art, then covers, inside covers, activity pages, marketing.
 * Each is signed off where it is seen, so the ledger records WHICH stage was
 * approved, by whom, and when — a single overall button could only ever mean
 * "all of it", which is not a thing anyone is actually deciding.
 *
 * Everything except approval is DERIVED from delivered content and cannot be
 * hand-edited: nobody can mark a delivered script "not received", and a stage
 * that has nothing in it cannot be approved at all.
 *
 * One doc per comic, `diamondApprovals/{line}__{slug}`, holding a `stages` map.
 * The collection started EMPTY on 2026-08-04 — that reset is the baseline.
 */

import { useEffect, useState } from 'react'
import { collection, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { hasResearch, pageBreakdown } from '@/lib/statusRows'
import type { Comic, Figure } from '@/types/content'

export const APPROVALS_COLLECTION = 'diamondApprovals'

// ── The stages ────────────────────────────────────────────────────────────────

export const STAGES = [
  'script',
  'dossier',
  'illustration',
  'covers',
  'insideCovers',
  'activities',
  'marketing',
] as const

export type Stage = (typeof STAGES)[number]

export const STAGE_LABEL: Record<Stage, string> = {
  script: 'Script',
  dossier: 'Dossier',
  illustration: 'Illustration',
  covers: 'Covers',
  insideCovers: 'IFC / IBC',
  activities: 'Activity pages',
  marketing: 'Marketing',
}

export interface StageApproval {
  by: string
  at: string
}

/** `stages` maps a stage to its approval; an absent key means not approved. */
export type ComicApprovals = Partial<Record<Stage, StageApproval>>

/**
 * Whether a stage has anything to approve yet.
 *
 * This is the guard that keeps the ledger honest: an Approve button only exists
 * where something has actually been delivered, so nobody can sign off an empty
 * stage and nobody can mark a stage "not received" either.
 */
export function stageReady(stage: Stage, c: Comic, figure?: Figure | null): boolean {
  const b = pageBreakdown(c)
  switch (stage) {
    // A comic is in the catalog only because a validated script exists.
    case 'script':
      return true
    case 'dossier':
      return !!figure && hasResearch(figure.sources_count ?? 0, figure.words ?? 0)
    case 'illustration':
      return b.interior > 0
    case 'covers':
      return b.cover === 1 || b.backCover === 1
    case 'insideCovers':
      return b.insideFront === 1 || b.insideBack === 1
    case 'activities':
      return b.activities > 0
    case 'marketing':
      return (
        !!c.aboutTheBook ||
        (c.amazonModules?.groups ?? []).some((g) => (g.images?.length ?? 0) > 0) ||
        (c.amazonModules?.images?.length ?? 0) > 0
      )
  }
}

// ── Who may approve ───────────────────────────────────────────────────────────

/**
 * Diamond signs off; the admin side can act too (to fix a mis-click, and
 * because Adnan runs the ledger). A plain member cannot.
 */
export function canApprove(email: string | null, canModerate: boolean): boolean {
  if (canModerate) return true
  return !!email && /@dpb\.in$/i.test(email.trim())
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface Async<T> { data: T | null; loading: boolean; error?: Error }

/**
 * Every comic's approvals, keyed `{line}__{slug}`.
 *
 * A read failure (offline, rules change) degrades to an empty map — the table
 * then shows everything as awaiting approval, which is the honest post-reset
 * state, rather than an error page.
 */
export function useApprovals(refreshKey = 0): Async<Record<string, ComicApprovals>> {
  const [state, setState] = useState<Async<Record<string, ComicApprovals>>>({ data: null, loading: true })
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const snap = await getDocs(collection(db, APPROVALS_COLLECTION))
        if (!alive) return
        const out: Record<string, ComicApprovals> = {}
        for (const d of snap.docs) {
          const raw = (d.data() ?? {}) as { stages?: Record<string, StageApproval> }
          const stages: ComicApprovals = {}
          for (const s of STAGES) {
            const v = raw.stages?.[s]
            if (v && typeof v.at === 'string') stages[s] = { by: v.by ?? '', at: v.at }
          }
          out[d.id] = stages
        }
        setState({ data: out, loading: false })
      } catch (e) {
        if (alive) setState({ data: {}, loading: false, error: e as Error })
      }
    })()
    return () => {
      alive = false
    }
  }, [refreshKey])
  return state
}

/**
 * Approve one stage.
 *
 * Merge-written under `stages.<stage>` so two people signing off different
 * stages of the same book cannot overwrite each other.
 */
export async function approveStage(comicId: string, stage: Stage, by: string): Promise<void> {
  await setDoc(
    doc(db, APPROVALS_COLLECTION, comicId),
    { stages: { [stage]: { by, at: new Date().toISOString() } }, updatedBy: by, updatedAt: new Date().toISOString() },
    { merge: true },
  )
}

/**
 * Withdraw one stage's approval.
 *
 * A merge-write cannot delete a nested key, so the surviving stages are written
 * back whole. The map is tiny (at most seven entries) and withdrawal is rare.
 */
export async function withdrawStage(
  comicId: string,
  stage: Stage,
  current: ComicApprovals,
  by: string,
): Promise<void> {
  const stages: Record<string, StageApproval> = {}
  for (const s of STAGES) {
    if (s !== stage && current[s]) stages[s] = current[s] as StageApproval
  }
  await setDoc(
    doc(db, APPROVALS_COLLECTION, comicId),
    { stages, updatedBy: by, updatedAt: new Date().toISOString() },
    { merge: true },
  )
}

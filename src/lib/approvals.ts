'use client'

/**
 * Diamond sign-off — the one state the client sets themselves.
 *
 * Everything else about a comic's standing is DERIVED from the catalog and can
 * never be hand-edited: nobody can mark a delivered script "not received", and
 * a complete set shows complete because its parts exist, not because somebody
 * remembered to flip a flag. The single human-set fact is Diamond's approval,
 * stored one doc per comic in `diamondApprovals/{line}__{slug}`.
 *
 * The collection starts EMPTY — that is the reset Adnan asked for (2026-08-04):
 * nobody is sure which books Diamond has approved, so the ledger restarts at
 * zero and every approval from here on is explicit, attributed and dated.
 */

import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isComplete, pageBreakdown } from '@/lib/statusRows'
import type { Comic } from '@/types/content'

export const APPROVALS_COLLECTION = 'diamondApprovals'

// ── Derived delivery state ────────────────────────────────────────────────────

export type DeliveryState = 'script' | 'illustration' | 'interior-done' | 'complete-set'

export interface Delivery {
  state: DeliveryState
  label: string
}

/**
 * Where a comic stands, read off the data alone.
 *
 * The ladder: a comic in the catalog has, by construction, a validated script —
 * so "script received" is the floor (there is deliberately no "not received"
 * rung for anyone to set). Art in progress, interior done, and the full set
 * (interior + cover + back cover + inside covers + activity pages) each follow
 * from what exists.
 */
export function deliveryOf(c: Comic): Delivery {
  const b = pageBreakdown(c)
  const fullSet =
    isComplete(c) && b.cover === 1 && b.backCover === 1 && b.insideCovers > 0 && b.activities > 0
  if (fullSet) return { state: 'complete-set', label: 'Complete set delivered' }
  if (isComplete(c)) return { state: 'interior-done', label: 'Interior complete' }
  if (b.interior > 0) return { state: 'illustration', label: 'Illustration underway' }
  return { state: 'script', label: 'Script received' }
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

export interface ApprovalDoc {
  approved: boolean
  by: string
  at: string
}

export interface Async<T> { data: T | null; loading: boolean; error?: Error }

/**
 * Every approval at once, keyed `{line}__{slug}`.
 *
 * A read failure (rules not yet deployed, offline) degrades to an empty map —
 * the table then shows every comic as awaiting approval, which is exactly the
 * post-reset truth, rather than an error page.
 */
export function useApprovals(refreshKey = 0): Async<Record<string, ApprovalDoc>> {
  const [state, setState] = useState<Async<Record<string, ApprovalDoc>>>({ data: null, loading: true })
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const snap = await getDocs(collection(db, APPROVALS_COLLECTION))
        if (!alive) return
        const out: Record<string, ApprovalDoc> = {}
        for (const d of snap.docs) {
          const x = d.data() as Partial<ApprovalDoc>
          if (x.approved) out[d.id] = { approved: true, by: x.by ?? '', at: x.at ?? '' }
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

export async function approve(comicId: string, by: string): Promise<void> {
  await setDoc(doc(db, APPROVALS_COLLECTION, comicId), {
    approved: true,
    by,
    at: new Date().toISOString(),
  })
}

/** Withdrawing an approval deletes the doc — back to the post-reset state. */
export async function unapprove(comicId: string): Promise<void> {
  await deleteDoc(doc(db, APPROVALS_COLLECTION, comicId))
}

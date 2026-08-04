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
import { collection, deleteField, doc, getDocs, setDoc } from 'firebase/firestore'
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

/**
 * The stages that gate INVOICING. Marketing review still exists as an internal
 * process (its column and approve button stay), but it does not determine
 * whether a book can be invoiced — Adnan, 2026-08-04.
 */
export const PRODUCTION_STAGES = STAGES.filter((s) => s !== 'marketing') as Stage[]

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
 * The invoice trail for one comic, two explicit human acts:
 *
 *   approved  — someone decided this book may be invoiced. It appears on the
 *               "Approved for invoice" tab from that moment.
 *   generated — the invoice has actually been raised, marked from that tab.
 *
 * Stored as an `invoice` map on the same diamondApprovals doc, so one document
 * still tells a comic's whole sign-off story.
 */
export interface InvoiceState {
  approved?: StageApproval
  generated?: StageApproval
}

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
 * because Adnan runs the ledger). A plain member cannot — and neither can a
 * VIEWER, even from a @dpb.in address: that role reads everything and acts on
 * nothing (mirrored in firestore.rules isViewer, so this is not just UI).
 */
export function canApprove(email: string | null, canModerate: boolean, viewer = false): boolean {
  if (viewer) return false
  if (canModerate) return true
  return !!email && /@dpb\.in$/i.test(email.trim())
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface Async<T> { data: T | null; loading: boolean; error?: Error }

/** Everything the sign-off ledger holds, keyed `{line}__{slug}`. */
export interface ApprovalsData {
  stages: Record<string, ComicApprovals>
  invoices: Record<string, InvoiceState>
}

const EMPTY_LEDGER: ApprovalsData = { stages: {}, invoices: {} }

function readMark(v: unknown): StageApproval | undefined {
  const m = v as StageApproval | undefined
  return m && typeof m.at === 'string' ? { by: m.by ?? '', at: m.at } : undefined
}

/**
 * Every comic's approvals and invoice trail, keyed `{line}__{slug}`.
 *
 * A read failure (offline, rules change) degrades to an empty ledger — the
 * table then shows everything as awaiting approval, which is the honest
 * post-reset state, rather than an error page.
 */
export function useApprovals(refreshKey = 0): Async<ApprovalsData> {
  const [state, setState] = useState<Async<ApprovalsData>>({ data: null, loading: true })
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const snap = await getDocs(collection(db, APPROVALS_COLLECTION))
        if (!alive) return
        const out: ApprovalsData = { stages: {}, invoices: {} }
        for (const d of snap.docs) {
          const raw = (d.data() ?? {}) as {
            stages?: Record<string, StageApproval>
            invoice?: Record<string, StageApproval>
          }
          const stages: ComicApprovals = {}
          for (const s of STAGES) {
            const v = readMark(raw.stages?.[s])
            if (v) stages[s] = v
          }
          out.stages[d.id] = stages
          const approved = readMark(raw.invoice?.approved)
          const generated = readMark(raw.invoice?.generated)
          if (approved || generated) out.invoices[d.id] = { approved, generated }
        }
        setState({ data: out, loading: false })
      } catch (e) {
        if (alive) setState({ data: EMPTY_LEDGER, loading: false, error: e as Error })
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
 * deleteField() inside a merge-write removes exactly that key. (Writing the
 * surviving stages back whole — the first version of this — did NOT work:
 * merge:true deep-merges maps, so the withdrawn stage quietly survived.)
 */
export async function withdrawStage(comicId: string, stage: Stage, by: string): Promise<void> {
  await setDoc(
    doc(db, APPROVALS_COLLECTION, comicId),
    { stages: { [stage]: deleteField() }, updatedBy: by, updatedAt: new Date().toISOString() },
    { merge: true },
  )
}

// ── The invoice trail ─────────────────────────────────────────────────────────

/** Mark a comic approved for invoice — it appears on the invoice tab from here. */
export async function approveForInvoice(comicId: string, by: string): Promise<void> {
  await setDoc(
    doc(db, APPROVALS_COLLECTION, comicId),
    {
      invoice: { approved: { by, at: new Date().toISOString() } },
      updatedBy: by,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  )
}

/** Mark the invoice raised. Only meaningful on an invoice-approved comic. */
export async function markInvoiceGenerated(comicId: string, by: string): Promise<void> {
  await setDoc(
    doc(db, APPROVALS_COLLECTION, comicId),
    {
      invoice: { generated: { by, at: new Date().toISOString() } },
      updatedBy: by,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  )
}

/**
 * Undo one invoice mark. Withdrawing the approval also clears `generated` —
 * a book that is no longer approved for invoice cannot stay marked invoiced.
 */
export async function withdrawInvoiceMark(
  comicId: string,
  which: 'approved' | 'generated',
  by: string,
): Promise<void> {
  const invoice =
    which === 'approved'
      ? { approved: deleteField(), generated: deleteField() }
      : { generated: deleteField() }
  await setDoc(
    doc(db, APPROVALS_COLLECTION, comicId),
    { invoice, updatedBy: by, updatedAt: new Date().toISOString() },
    { merge: true },
  )
}

'use client'

/**
 * Advances against work — the money Diamond's group companies have paid us
 * BEFORE invoices, shown on the status page's Accounts tab.
 *
 * One Firestore doc (`accounts/advances`) holds the whole ledger, exactly like
 * `pricing/config`: it is small, it is read in one go, and a single doc means a
 * reader can never see half an edit. Each receipt records what actually
 * happened at the bank:
 *
 *   { id, date: '2026-05-13', company: 'Diamond Magazines Private Limited',
 *     amount: 33494, tdsDeducted: true }
 *
 * `amount` is always the money RECEIVED. When the payer deducted 2% TDS at
 * source (`tdsDeducted`), the received amount is 98% of the gross advance, so
 * the gross and the TDS credit are derived, never hand-typed:
 *
 *   tds   = amount × 2⁄98      (2% of the gross they computed it on)
 *   gross = amount + tds
 *
 * A receipt with no deduction is its own gross. The five seed receipts come
 * from the accounts team (2026-08-04) and are written by the private repo's
 * tools/seed_advances.py — real figures never live in this public repo.
 */

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { TDS_RATE } from '@/lib/pricing'

export const ACCOUNTS_COLLECTION = 'accounts'
export const ADVANCES_DOC = 'advances'

export interface Advance {
  id: string
  /** YYYY-MM-DD — the day the money arrived. */
  date: string
  /** The paying company, exactly as the accounts team names it. */
  company: string
  /** Rupees actually received at the bank. */
  amount: number
  /** True when the payer deducted 2% TDS at source on this advance. */
  tdsDeducted: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** The TDS the payer kept back on this receipt (0 when none was deducted). */
export function advanceTds(a: Pick<Advance, 'amount' | 'tdsDeducted'>): number {
  return a.tdsDeducted ? round2(a.amount * (TDS_RATE / (1 - TDS_RATE))) : 0
}

/** What the advance was worth before the deduction — received + TDS credit. */
export function advanceGross(a: Pick<Advance, 'amount' | 'tdsDeducted'>): number {
  return round2(a.amount + advanceTds(a))
}

export interface AdvanceTotals {
  receipts: number
  companies: string[]
  /** Σ money received at the bank. */
  received: number
  /** Σ TDS the payers deducted at source. */
  tds: number
  /** Σ gross advance value (received + TDS credits). */
  gross: number
}

export function advanceTotals(items: Advance[]): AdvanceTotals {
  const t: AdvanceTotals = { receipts: items.length, companies: [], received: 0, tds: 0, gross: 0 }
  const names = new Set<string>()
  for (const a of items) {
    names.add(a.company)
    t.received += a.amount
    t.tds += advanceTds(a)
    t.gross += advanceGross(a)
  }
  t.received = round2(t.received)
  t.tds = round2(t.tds)
  t.gross = round2(t.gross)
  t.companies = Array.from(names).sort()
  return t
}

/** Oldest first — a ledger reads in the order the money arrived. */
export function sortAdvances(items: Advance[]): Advance[] {
  return items.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface Async<T> { data: T | null; loading: boolean; error?: Error }

function parseItems(raw: unknown): Advance[] {
  if (!Array.isArray(raw)) return []
  const out: Advance[] = []
  for (const v of raw) {
    const a = v as Partial<Advance>
    if (typeof a?.id === 'string' && typeof a.date === 'string' && Number.isFinite(a.amount)) {
      out.push({
        id: a.id,
        date: a.date,
        company: typeof a.company === 'string' ? a.company : '',
        amount: a.amount as number,
        tdsDeducted: a.tdsDeducted === true,
      })
    }
  }
  return sortAdvances(out)
}

/**
 * Read the ledger. A missing doc is an empty ledger, not an error — the tab
 * then says "no advances recorded" instead of breaking.
 */
export function useAdvances(refreshKey = 0): Async<Advance[]> {
  const [state, setState] = useState<Async<Advance[]>>({ data: null, loading: true })
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, ACCOUNTS_COLLECTION, ADVANCES_DOC))
        if (!alive) return
        setState({ data: parseItems(snap.exists() ? snap.data()?.items : []), loading: false })
      } catch (e) {
        if (alive) setState({ data: [], loading: false, error: e as Error })
      }
    })()
    return () => {
      alive = false
    }
  }, [refreshKey])
  return state
}

/**
 * Write the ledger whole. The list is tiny (a handful of receipts a year) and
 * whole-list writes make add/remove trivially correct — no nested-map delete
 * gymnastics, no half-merged rows.
 */
export async function saveAdvances(items: Advance[], by: string): Promise<void> {
  await setDoc(
    doc(db, ACCOUNTS_COLLECTION, ADVANCES_DOC),
    { items: sortAdvances(items), updatedAt: new Date().toISOString(), updatedBy: by },
    { merge: true },
  )
}

export function newAdvanceId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `adv-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

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
 * source (`tdsDeducted`), what they paid is the GST-inclusive value net of TDS
 * on the base — the ₹116 of the standard chain (₹100 base + ₹18 GST − ₹2 TDS).
 * So the base, the TDS credit and the gross are derived, never hand-typed
 * (accounts team, 2026-08-04: "advance ÷ 1.16 × 2%"):
 *
 *   base  = amount ÷ 1.16      (1 + GST 18% − TDS 2%)
 *   tds   = base × 2%
 *   gross = amount + tds       (= base × 1.18, the with-GST value before TDS)
 *
 * Proof it fits: ₹34,800 received ÷ 1.16 = ₹30,000 base exactly → ₹600 TDS.
 * A receipt with no deduction is its own gross. The five seed receipts come
 * from the accounts team (2026-08-04) and are written by the private repo's
 * tools/seed_advances.py — real figures never live in this public repo.
 */

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { GST_RATE, TDS_RATE } from '@/lib/pricing'

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

/**
 * The net-of-TDS multiplier a deducted receipt was paid at: 1 + GST − TDS
 * (1.16 at today's rates). Received ÷ this = the base the TDS was 2% of.
 */
const NET_FACTOR = 1 + GST_RATE - TDS_RATE

/** The TDS the payer kept back on this receipt (0 when none was deducted). */
export function advanceTds(a: Pick<Advance, 'amount' | 'tdsDeducted'>): number {
  return a.tdsDeducted ? round2((a.amount / NET_FACTOR) * TDS_RATE) : 0
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

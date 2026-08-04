import { describe, it, expect, vi } from 'vitest'

const mockSetDoc = vi.fn()
const mockGetDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ __path: `${col}/${id}` }),
  getDoc: (...a: unknown[]) => mockGetDoc(...a),
  setDoc: (...a: unknown[]) => mockSetDoc(...a),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))

import {
  advanceGross,
  advanceTds,
  advanceTotals,
  saveAdvances,
  sortAdvances,
  type Advance,
} from '@/lib/advances'

// The five receipts the accounts team dictated (2026-08-04). The numbers here
// are the REAL ones — if the maths in advances.ts drifts, these fail loudly.
const SEED: Advance[] = [
  { id: 'dmpl-1', date: '2026-05-13', company: 'Diamond Magazines Private Limited', amount: 33_494, tdsDeducted: true },
  { id: 'dmpl-2', date: '2026-06-05', company: 'Diamond Magazines Private Limited', amount: 34_800, tdsDeducted: true },
  { id: 'dmpl-3', date: '2026-06-16', company: 'Diamond Magazines Private Limited', amount: 50_000, tdsDeducted: false },
  { id: 'dmpl-4', date: '2026-06-23', company: 'Diamond Magazines Private Limited', amount: 50_000, tdsDeducted: false },
  { id: 'trijal-1', date: '2026-06-06', company: 'Trijal TradeCop Pvt Ltd', amount: 50_000, tdsDeducted: false },
]

describe('advance TDS gross-up', () => {
  // The accounts team's formula (2026-08-04): TDS = received ÷ 1.16 × 2%.
  // A deducted receipt is the GST-inclusive value net of TDS on the base
  // (₹116 for every ₹100 of base), so received ÷ 1.16 recovers the base.
  it('TDS = received ÷ 1.16 × 2% — ₹34,800 is exactly a ₹30,000 base, ₹600 TDS', () => {
    expect(advanceTds(SEED[1])).toBe(600)
    expect(advanceGross(SEED[1])).toBe(35_400) // base × 1.18, the with-GST value
    // ₹33,494 received → base ₹28,874.14 → ₹577.48 TDS, ₹34,071.48 gross.
    expect(advanceTds(SEED[0])).toBe(577.48)
    expect(advanceGross(SEED[0])).toBe(34_071.48)
  })

  it('a receipt with no deduction is its own gross', () => {
    expect(advanceTds(SEED[2])).toBe(0)
    expect(advanceGross(SEED[2])).toBe(50_000)
  })

  it('totals the ledger: ₹2,18,294 received across 5 receipts from 2 companies', () => {
    const t = advanceTotals(SEED)
    expect(t.receipts).toBe(5)
    expect(t.companies).toEqual(['Diamond Magazines Private Limited', 'Trijal TradeCop Pvt Ltd'])
    expect(t.received).toBe(218_294)
    expect(t.tds).toBe(1_177.48)
    expect(t.gross).toBe(219_471.48)
  })
})

describe('ledger order and writes', () => {
  it('sorts receipts by the day the money arrived', () => {
    expect(sortAdvances(SEED).map((a) => a.date)).toEqual([
      '2026-05-13', '2026-06-05', '2026-06-06', '2026-06-16', '2026-06-23',
    ])
  })

  it('saves the list whole, sorted, merge-written to accounts/advances', async () => {
    await saveAdvances(SEED, 'a@thothica.com')
    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    const [ref, payload, opts] = mockSetDoc.mock.calls[0]
    expect(ref.__path).toBe('accounts/advances')
    expect(opts).toEqual({ merge: true })
    expect(payload.updatedBy).toBe('a@thothica.com')
    expect(payload.items.map((a: Advance) => a.id)).toEqual([
      'dmpl-1', 'dmpl-2', 'trijal-1', 'dmpl-3', 'dmpl-4',
    ])
  })
})

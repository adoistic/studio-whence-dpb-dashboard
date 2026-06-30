import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ── Firestore mock ────────────────────────────────────────────────────────────────
// doc() returns a tagged object so we can assert the path the mutation targeted;
// the write fns are spies; serverTimestamp() returns a sentinel; getDoc is driven
// per-test to exercise the missing-doc and present-doc mappings.

const mockSetDoc = vi.fn()
const mockGetDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ __path: `${col}/${id}` }),
  getDoc: (...a: unknown[]) => mockGetDoc(...a),
  setDoc: (...a: unknown[]) => mockSetDoc(...a),
  serverTimestamp: () => '__ts__',
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))

import {
  deriveEffectiveFigures,
  setGrants,
  addGrant,
  removeGrant,
  useAllocation,
  type Allocation,
} from '@/lib/allocation'

beforeEach(() => {
  mockSetDoc.mockReset(); mockSetDoc.mockResolvedValue(undefined)
  mockGetDoc.mockReset()
})

const ADMIN = 'adnan@thothica.com'

const alloc = (over: Partial<Allocation> = {}): Allocation => ({
  email: 'm@x.com', lines: [], figures: [], comics: [], programs: [], figures_effective: [], ...over,
})

// ── deriveEffectiveFigures ──────────────────────────────────────────────────────────

describe('deriveEffectiveFigures', () => {
  it('unions raw figures with comic-implied subjects', () => {
    const out = deriveEffectiveFigures(
      ['sachin-tendulkar'],
      ['biographies__01-the-wall'],
      { 'biographies__01-the-wall': 'rahul-dravid' },
    )
    expect(out).toEqual(['sachin-tendulkar', 'rahul-dravid'])
  })

  it('drops a comic with no mapped subject', () => {
    const out = deriveEffectiveFigures(
      ['sachin-tendulkar'],
      ['biographies__99-unknown'],
      {}, // no mapping for the comic
    )
    expect(out).toEqual(['sachin-tendulkar'])
  })

  it('dedupes an already-listed figure that a comic also implies', () => {
    const out = deriveEffectiveFigures(
      ['rahul-dravid'],
      ['biographies__01-the-wall'],
      { 'biographies__01-the-wall': 'rahul-dravid' },
    )
    expect(out).toEqual(['rahul-dravid'])
  })

  it('dedupes across two comics implying the same subject', () => {
    const out = deriveEffectiveFigures(
      [],
      ['c1', 'c2'],
      { c1: 'virat-kohli', c2: 'virat-kohli' },
    )
    expect(out).toEqual(['virat-kohli'])
  })

  it('treats an explicit undefined subject as dropped', () => {
    const out = deriveEffectiveFigures([], ['c1'], { c1: undefined })
    expect(out).toEqual([])
  })

  it('returns an empty array for empty inputs', () => {
    expect(deriveEffectiveFigures([], [], {})).toEqual([])
  })
})

// ── setGrants ────────────────────────────────────────────────────────────────────────

describe('setGrants', () => {
  it('writes allocations/{lowercased-email} with raw grants + computed figures_effective', async () => {
    await setGrants(
      '  Member@DPB.IN ',
      {
        lines: ['biographies'],
        figures: ['sachin-tendulkar'],
        comics: ['biographies__01-the-wall'],
        programs: ['cricket-legends'],
      },
      { adminEmail: ADMIN, subjectByComic: { 'biographies__01-the-wall': 'rahul-dravid' } },
    )

    expect(mockSetDoc).toHaveBeenCalledWith(
      { __path: 'allocations/member@dpb.in' },
      {
        lines: ['biographies'],
        figures: ['sachin-tendulkar'],
        comics: ['biographies__01-the-wall'],
        programs: ['cricket-legends'],
        figures_effective: ['sachin-tendulkar', 'rahul-dravid'],
        updatedBy: ADMIN,
        updatedAt: '__ts__',
      },
    )
  })

  it('writes empty figures_effective when there are no figures/comics', async () => {
    await setGrants(
      'a@b.com',
      { lines: ['indic'], figures: [], comics: [], programs: [] },
      { adminEmail: ADMIN, subjectByComic: {} },
    )
    expect(mockSetDoc).toHaveBeenCalledWith(
      { __path: 'allocations/a@b.com' },
      expect.objectContaining({ lines: ['indic'], figures: [], comics: [], programs: [], figures_effective: [] }),
    )
  })
})

// ── addGrant / removeGrant (pure) ──────────────────────────────────────────────────

describe('addGrant', () => {
  it('adds to the right raw list', () => {
    expect(addGrant(alloc(), 'line', 'biographies')).toEqual(
      { lines: ['biographies'], figures: [], comics: [], programs: [] },
    )
    expect(addGrant(alloc(), 'figure', 'sachin-tendulkar')).toEqual(
      { lines: [], figures: ['sachin-tendulkar'], comics: [], programs: [] },
    )
    expect(addGrant(alloc(), 'comic', 'biographies__01')).toEqual(
      { lines: [], figures: [], comics: ['biographies__01'], programs: [] },
    )
    expect(addGrant(alloc(), 'program', 'cricket-legends')).toEqual(
      { lines: [], figures: [], comics: [], programs: ['cricket-legends'] },
    )
  })

  it('is idempotent when the value is already present', () => {
    const a = alloc({ figures: ['sachin-tendulkar'] })
    expect(addGrant(a, 'figure', 'sachin-tendulkar')).toEqual(
      { lines: [], figures: ['sachin-tendulkar'], comics: [], programs: [] },
    )
  })

  it('does not mutate the input allocation', () => {
    const a = alloc({ lines: ['biographies'] })
    addGrant(a, 'line', 'indic')
    expect(a.lines).toEqual(['biographies'])
  })
})

describe('removeGrant', () => {
  it('removes from the right raw list', () => {
    const a = alloc({ figures: ['sachin-tendulkar', 'virat-kohli'] })
    expect(removeGrant(a, 'figure', 'sachin-tendulkar')).toEqual(
      { lines: [], figures: ['virat-kohli'], comics: [], programs: [] },
    )
  })

  it('removes a program grant', () => {
    const a = alloc({ programs: ['cricket-legends', 'tech-legends'] })
    expect(removeGrant(a, 'program', 'cricket-legends')).toEqual(
      { lines: [], figures: [], comics: [], programs: ['tech-legends'] },
    )
  })

  it('is a no-op when removing an absent value', () => {
    const a = alloc({ lines: ['biographies'] })
    expect(removeGrant(a, 'line', 'indic')).toEqual(
      { lines: ['biographies'], figures: [], comics: [], programs: [] },
    )
  })

  it('does not mutate the input allocation', () => {
    const a = alloc({ comics: ['c1', 'c2'] })
    removeGrant(a, 'comic', 'c1')
    expect(a.comics).toEqual(['c1', 'c2'])
  })
})

// ── useAllocation ──────────────────────────────────────────────────────────────────

describe('useAllocation', () => {
  it('returns null for a null email (no read)', async () => {
    const { result } = renderHook(() => useAllocation(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('maps a missing doc to an empty-grant object keyed on the lowercased email', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined })
    const { result } = renderHook(() => useAllocation('  Member@DPB.IN '))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual({
      email: 'member@dpb.in', lines: [], figures: [], comics: [], programs: [], figures_effective: [],
    })
  })

  it('maps a present doc to its fields', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        lines: ['biographies'],
        figures: ['sachin-tendulkar'],
        comics: ['biographies__01'],
        programs: ['cricket-legends'],
        figures_effective: ['sachin-tendulkar', 'rahul-dravid'],
      }),
    })
    const { result } = renderHook(() => useAllocation('m@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual({
      email: 'm@x.com',
      lines: ['biographies'],
      figures: ['sachin-tendulkar'],
      comics: ['biographies__01'],
      programs: ['cricket-legends'],
      figures_effective: ['sachin-tendulkar', 'rahul-dravid'],
    })
  })

  it('fills missing array fields on a present doc with empties', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ lines: ['indic'] }) })
    const { result } = renderHook(() => useAllocation('m@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual({
      email: 'm@x.com', lines: ['indic'], figures: [], comics: [], programs: [], figures_effective: [],
    })
  })
})

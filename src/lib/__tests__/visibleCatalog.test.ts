import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ── Firestore mock ─────────────────────────────────────────────────────────────────
//
// `where` returns a tagged constraint so each query's predicate is inspectable;
// `documentId()` returns a sentinel field used as the `where` field; `query`
// collects its constraints; `getDocs` is routed per-call by inspecting the query's
// single constraint, so a test can assert WHICH predicate ran and what it returned.
// `getDoc` serves the allocation doc.

const mockGetDoc = vi.fn()
const mockGetDocs = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ __col: name }),
  doc: (_db: unknown, col: string, id: string) => ({ __path: `${col}/${id}` }),
  documentId: () => '__id__',
  where: (field: string, op: string, value: unknown) => ({ __where: { field, op, value } }),
  query: (col: unknown, ...constraints: unknown[]) => ({ __col: col, constraints }),
  getDoc: (...a: unknown[]) => mockGetDoc(...a),
  getDocs: (...a: unknown[]) => mockGetDocs(...a),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/admin', () => ({ normalizeEmail: (e: string) => e.trim().toLowerCase() }))

import { chunk, useVisibleComics, useVisibleFigures } from '@/lib/visibleCatalog'

// ── Helpers ─────────────────────────────────────────────────────────────────────────

const snap = (docs: Record<string, unknown>[]) => ({ docs: docs.map((d) => ({ data: () => d })) })

// An allocation getDoc result.
const allocSnap = (data: Record<string, unknown> | null) =>
  data === null ? { exists: () => false, data: () => undefined } : { exists: () => true, data: () => data }

// Pull the single `where` predicate from a getDocs call's query argument.
function predicate(callArg: unknown): { field: string; op: string; value: unknown } | null {
  const q = callArg as { __col?: { __col?: string }; constraints?: { __where?: { field: string; op: string; value: unknown } }[] }
  const c = q.constraints?.[0]?.__where
  return c ?? null
}

// Is this getDocs call a full collection scan (no query wrapper)?
function isFullScan(callArg: unknown): boolean {
  const q = callArg as { __col?: unknown; constraints?: unknown }
  return q?.__col === 'comics' || q?.__col === 'figures'
}

beforeEach(() => {
  mockGetDoc.mockReset()
  mockGetDocs.mockReset()
})

// ── chunk ───────────────────────────────────────────────────────────────────────────

describe('chunk', () => {
  it('returns no chunks for an empty array', () => {
    expect(chunk([])).toEqual([])
  })
  it('keeps a sub-30 array as one chunk', () => {
    expect(chunk([1, 2, 3])).toEqual([[1, 2, 3]])
  })
  it('splits >30 values into ≤30-value chunks', () => {
    const arr = Array.from({ length: 65 }, (_, i) => i)
    const out = chunk(arr)
    expect(out).toHaveLength(3)
    expect(out[0]).toHaveLength(30)
    expect(out[1]).toHaveLength(30)
    expect(out[2]).toHaveLength(5)
    expect(out.flat()).toEqual(arr)
  })
  it('honors a custom size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})

// ── useVisibleComics ──────────────────────────────────────────────────────────────────

describe('useVisibleComics', () => {
  it('moderator → a single full getDocs scan (no allocation read)', async () => {
    mockGetDocs.mockResolvedValue(snap([{ line: 'biographies', slug: '01-a' }]))
    const { result } = renderHook(() => useVisibleComics(true, 'mod@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockGetDocs).toHaveBeenCalledTimes(1)
    expect(isFullScan(mockGetDocs.mock.calls[0][0])).toBe(true)
    expect(result.current.data).toHaveLength(1)
  })

  it('member with a line grant → a `line in` query', async () => {
    mockGetDoc.mockResolvedValue(allocSnap({ lines: ['biographies'], figures: [], comics: [], figures_effective: ['x'] }))
    mockGetDocs.mockResolvedValue(snap([{ line: 'biographies', slug: '01-a' }]))
    const { result } = renderHook(() => useVisibleComics(false, 'm@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDocs).toHaveBeenCalledTimes(1)
    const p = predicate(mockGetDocs.mock.calls[0][0])
    expect(p).toEqual({ field: 'line', op: 'in', value: ['biographies'] })
    expect(result.current.data).toHaveLength(1)
  })

  it('member with a figure grant → a `subject_slug in` query using RAW figures', async () => {
    mockGetDoc.mockResolvedValue(allocSnap({ lines: [], figures: ['sachin'], comics: [], figures_effective: ['sachin', 'extra'] }))
    mockGetDocs.mockResolvedValue(snap([{ line: 'biographies', slug: '01-s', subject_slug: 'sachin' }]))
    const { result } = renderHook(() => useVisibleComics(false, 'm@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDocs).toHaveBeenCalledTimes(1)
    const p = predicate(mockGetDocs.mock.calls[0][0])
    // RAW figures (['sachin']), NOT figures_effective (['sachin','extra']).
    expect(p).toEqual({ field: 'subject_slug', op: 'in', value: ['sachin'] })
  })

  it('member with a single-comic grant → a `documentId in` query returning JUST that comic', async () => {
    mockGetDoc.mockResolvedValue(allocSnap({ lines: [], figures: [], comics: ['biographies__01-a'], figures_effective: [] }))
    mockGetDocs.mockResolvedValue(snap([{ line: 'biographies', slug: '01-a' }]))
    const { result } = renderHook(() => useVisibleComics(false, 'm@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDocs).toHaveBeenCalledTimes(1)
    const p = predicate(mockGetDocs.mock.calls[0][0])
    expect(p).toEqual({ field: '__id__', op: 'in', value: ['biographies__01-a'] })
    // Only the granted comic — no siblings.
    expect(result.current.data).toEqual([{ line: 'biographies', slug: '01-a' }])
  })

  it('union dedupes a comic granted by both line and id', async () => {
    mockGetDoc.mockResolvedValue(allocSnap({ lines: ['biographies'], figures: [], comics: ['biographies__01-a'], figures_effective: [] }))
    // Both queries return the same comic.
    mockGetDocs.mockResolvedValue(snap([{ line: 'biographies', slug: '01-a' }]))
    const { result } = renderHook(() => useVisibleComics(false, 'm@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDocs).toHaveBeenCalledTimes(2) // line + id queries
    expect(result.current.data).toHaveLength(1)  // deduped by `${line}__${slug}`
  })

  it('member with an empty allocation → [] and NO query', async () => {
    mockGetDoc.mockResolvedValue(allocSnap({ lines: [], figures: [], comics: [], figures_effective: [] }))
    const { result } = renderHook(() => useVisibleComics(false, 'm@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDocs).not.toHaveBeenCalled()
    expect(result.current.data).toEqual([])
  })

  it('member with a missing allocation doc → [] and NO query', async () => {
    mockGetDoc.mockResolvedValue(allocSnap(null))
    const { result } = renderHook(() => useVisibleComics(false, 'm@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDocs).not.toHaveBeenCalled()
    expect(result.current.data).toEqual([])
  })

  it('member with no email → [] and no reads at all', async () => {
    const { result } = renderHook(() => useVisibleComics(false, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockGetDocs).not.toHaveBeenCalled()
    expect(result.current.data).toEqual([])
  })
})

// ── useVisibleFigures ─────────────────────────────────────────────────────────────────

describe('useVisibleFigures', () => {
  it('moderator → a single full getDocs scan', async () => {
    mockGetDocs.mockResolvedValue(snap([{ slug: 'sachin' }]))
    const { result } = renderHook(() => useVisibleFigures(true, 'mod@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockGetDocs).toHaveBeenCalledTimes(1)
    expect(isFullScan(mockGetDocs.mock.calls[0][0])).toBe(true)
  })

  it('member → figures by documentId() in figures_effective', async () => {
    mockGetDoc.mockResolvedValue(allocSnap({ lines: [], figures: ['sachin'], comics: [], figures_effective: ['sachin'] }))
    mockGetDocs.mockResolvedValue(snap([{ slug: 'sachin' }]))
    const { result } = renderHook(() => useVisibleFigures(false, 'm@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDocs).toHaveBeenCalledTimes(1)
    const p = predicate(mockGetDocs.mock.calls[0][0])
    expect(p).toEqual({ field: '__id__', op: 'in', value: ['sachin'] })
    expect(result.current.data).toEqual([{ slug: 'sachin' }])
  })

  it('member with an empty allocation → [] and NO query', async () => {
    mockGetDoc.mockResolvedValue(allocSnap({ lines: [], figures: [], comics: [], figures_effective: [] }))
    const { result } = renderHook(() => useVisibleFigures(false, 'm@x.com'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDocs).not.toHaveBeenCalled()
    expect(result.current.data).toEqual([])
  })
})

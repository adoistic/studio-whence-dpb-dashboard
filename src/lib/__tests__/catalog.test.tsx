import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHeadline, useComic, useComics, useFigure, usePeople } from '@/lib/catalog'

const mockGetDoc = vi.fn()
const mockGetDocs = vi.fn()
vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => ({ __doc: a }),
  collection: (...a: unknown[]) => ({ __col: a }),
  query: (...a: unknown[]) => ({ __q: a }),
  where: (...a: unknown[]) => ({ __where: a }),
  getDoc: (...a: unknown[]) => mockGetDoc(...a),
  getDocs: (...a: unknown[]) => mockGetDocs(...a),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))

beforeEach(() => { mockGetDoc.mockReset(); mockGetDocs.mockReset() })

describe('catalog hooks', () => {
  it('useHeadline reads meta/catalog', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ headline: { lines_active: 4 } }) })
    const { result } = renderHook(() => useHeadline())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.headline.lines_active).toBe(4)
  })
  it('useComic reads one comic doc by line+slug', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ title: 'X', status: 'draft' }) })
    const { result } = renderHook(() => useComic('biographies', '01-x'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.title).toBe('X')
  })
  it('useComics(filters) queries the comics collection', async () => {
    mockGetDocs.mockResolvedValue({ docs: [{ data: () => ({ slug: '01-x', status: 'draft' }) }] })
    const { result } = renderHook(() => useComics({ line: 'biographies', status: 'draft' }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toHaveLength(1)
  })
  it('useFigure reads the doc + its sources subcollection', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ slug: 'jrd-tata', series: 'S', sources_count: 1, words: 9 }) })
    mockGetDocs.mockResolvedValue({ docs: [{ data: () => ({ slug: 'book-a', kind: 'book', title: 'A', words: 5, files: [] }) }] })
    const { result } = renderHook(() => useFigure('jrd-tata'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.figure.sources).toHaveLength(1)
  })
  it('usePeople(line) queries the people collection', async () => {
    mockGetDocs.mockResolvedValue({ docs: [{ data: () => ({ slug: 'jrd-tata', stage: 'approved', is_orphan: false }) }] })
    const { result } = renderHook(() => usePeople('biographies'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.[0].stage).toBe('approved')
  })
  it('surfaces an error state when a read throws', async () => {
    mockGetDoc.mockRejectedValue(new Error('denied'))
    const { result } = renderHook(() => useHeadline())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })
})

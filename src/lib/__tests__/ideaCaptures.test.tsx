/**
 * Tests for the ideas/{ideaId}/captures live hook (useIdeaCaptures) and the
 * gated transcript reader (readIdeaCapture in dataApi).
 *
 * firebase/firestore is mocked so no real SDK listener is created; the
 * onSnapshot next/error callbacks are captured and fired by hand. Firebase
 * itself is stubbed (same convention as dataApi.test.ts / ideas.test.ts) and
 * global.fetch is stubbed for the dataApi half.
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { IdeaCapture } from '@/types/idea'

// ─── Mocks ──────────────────────────────────────────────────────────────────
const mockOnSnapshot = vi.fn()
const mockGetIdToken = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => ({ __collection: args })),
  query: vi.fn((...args: unknown[]) => ({ __query: args })),
  orderBy: vi.fn((field: string) => ({ __orderBy: field })),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}))
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { getIdToken: (...args: unknown[]) => mockGetIdToken(...args) } },
}))

import { collection, orderBy } from 'firebase/firestore'
import { useIdeaCaptures } from '@/lib/ideaCaptures'
import { readIdeaCapture } from '@/lib/dataApi'

type SnapDoc = { id: string; data: () => object }
const snap = (docs: SnapDoc[]) => ({ docs })

const captureData = (over: Partial<IdeaCapture> = {}): object => ({
  url: 'https://chatgpt.com/share/abc-123',
  shareId: 'abc-123',
  status: 'captured',
  error: null,
  title: 'A chat',
  model: 'gpt-4o',
  messageCount: 17,
  charCount: 12345,
  r2Key: 'ideas/idea-1/captures/abc-123.md',
  createdAt: null,
  capturedAt: null,
  ...over,
})

beforeEach(() => {
  mockOnSnapshot.mockReset()
  mockOnSnapshot.mockReturnValue(() => {})
})

// ─── useIdeaCaptures ────────────────────────────────────────────────────────

describe('useIdeaCaptures', () => {
  test('surfaces snapshot docs as IdeaCapture[]; the doc id wins over a data id field', () => {
    let next: ((s: ReturnType<typeof snap>) => void) | undefined
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      next = onNext
      return () => {}
    })

    const { result } = renderHook(() => useIdeaCaptures('idea-1'))

    // Initial state: empty + loading until the first snapshot arrives.
    expect(result.current).toEqual({ data: [], loading: true })

    act(() => {
      next!(
        snap([
          // The data carries a bogus `id` field — the Firestore doc id must win.
          { id: 'abc-123', data: () => captureData({ id: 'WRONG' } as Partial<IdeaCapture>) },
          { id: 'def-456', data: () => captureData({ shareId: 'def-456', status: 'pending', title: null }) },
        ]),
      )
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeUndefined()
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data[0].id).toBe('abc-123')
    expect(result.current.data[0].title).toBe('A chat')
    expect(result.current.data[0].messageCount).toBe(17)
    expect(result.current.data[1].id).toBe('def-456')
    expect(result.current.data[1].status).toBe('pending')

    // Subscribed to the right subcollection, ordered by createdAt.
    expect(vi.mocked(collection).mock.calls[0].slice(1)).toEqual(['ideas', 'idea-1', 'captures'])
    expect(vi.mocked(orderBy)).toHaveBeenCalledWith('createdAt')
  })

  test('the error callback sets error and empties data', () => {
    let next: ((s: ReturnType<typeof snap>) => void) | undefined
    let fail: ((e: Error) => void) | undefined
    mockOnSnapshot.mockImplementation((_q, onNext, onError) => {
      next = onNext
      fail = onError
      return () => {}
    })

    const { result } = renderHook(() => useIdeaCaptures('idea-1'))
    act(() => next!(snap([{ id: 'abc-123', data: () => captureData() }])))
    expect(result.current.data).toHaveLength(1)

    act(() => fail!(new Error('permission-denied')))
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.data).toEqual([])
  })

  test('unsubscribes on unmount', () => {
    const unsub = vi.fn()
    mockOnSnapshot.mockReturnValue(unsub)
    const { unmount } = renderHook(() => useIdeaCaptures('idea-1'))
    unmount()
    expect(unsub).toHaveBeenCalledTimes(1)
  })
})

// ─── readIdeaCapture ────────────────────────────────────────────────────────

const BASE = 'https://dataapi.example.com'
const mockFetch = vi.fn()

function fakeRes(opts: { ok: boolean; status: number; text?: string }): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    text: async () => opts.text ?? '',
  } as unknown as Response
}

describe('readIdeaCapture', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DATA_API_URL', BASE)
    mockGetIdToken.mockReset()
    mockGetIdToken.mockResolvedValue('tok-123')
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  test('GETs /idea-capture?ideaId=&captureId= (encoded) with the Bearer token and returns text', async () => {
    mockFetch.mockResolvedValueOnce(fakeRes({ ok: true, status: 200, text: '# Transcript' }))

    const result = await readIdeaCapture('idea/1', 'cap 1')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(`${BASE}/idea-capture?ideaId=idea%2F1&captureId=cap%201`)
    const headers = new Headers((init as RequestInit).headers)
    expect(headers.get('Authorization')).toBe('Bearer tok-123')
    expect(result).toBe('# Transcript')
  })

  test('non-ok (403) throws with the status in the message', async () => {
    mockFetch.mockResolvedValueOnce(fakeRes({ ok: false, status: 403 }))
    await expect(readIdeaCapture('idea-1', 'abc-123')).rejects.toThrow(/403/)
  })
})

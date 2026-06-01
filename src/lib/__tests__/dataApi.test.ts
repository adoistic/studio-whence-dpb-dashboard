/**
 * Tests for src/lib/dataApi.ts — the token-bearing client fetch layer for the
 * gated dataApi Cloud Function (content / resolve / read).
 *
 * Firebase is mocked so no real auth singleton is touched; global.fetch is
 * stubbed with fake Response-like objects.
 *
 * BASE is read from process.env.NEXT_PUBLIC_DATA_API_URL. dataApi reads it at
 * call time (not import time), so a beforeEach stubEnv is enough; we still
 * import the module normally.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Firebase mock ──────────────────────────────────────────────────────────
// A single getIdToken mock we control per test.
const mockGetIdToken = vi.fn()
vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { getIdToken: (...args: unknown[]) => mockGetIdToken(...args) } },
}))

import { fetchContent, resolveUrls, readMarkdown } from '@/lib/dataApi'

const BASE = 'https://dataapi.example.com'

/** Build a fake Response-like object. */
function fakeRes(opts: {
  ok: boolean
  status: number
  json?: unknown
  text?: string
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    json: async () => opts.json,
    text: async () => opts.text ?? '',
  } as unknown as Response
}

const mockFetch = vi.fn()

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

// ─── fetchContent ─────────────────────────────────────────────────────────

describe('fetchContent', () => {
  test('GETs /content with Authorization: Bearer <token> and parses JSON', async () => {
    const content = { generated_at: 'now', lines: [] }
    mockFetch.mockResolvedValueOnce(fakeRes({ ok: true, status: 200, json: content }))

    const result = await fetchContent()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(`${BASE}/content`)
    const headers = new Headers((init as RequestInit).headers)
    expect(headers.get('Authorization')).toBe('Bearer tok-123')
    expect(result).toEqual(content)
  })

  test('non-ok (403) throws an error including the status', async () => {
    mockFetch.mockResolvedValueOnce(fakeRes({ ok: false, status: 403 }))
    await expect(fetchContent()).rejects.toThrow(/403/)
  })

  test('401 on first attempt → force-refresh token once and retry, then succeed', async () => {
    const content = { generated_at: 'now', lines: [] }
    mockFetch
      .mockResolvedValueOnce(fakeRes({ ok: false, status: 401 }))
      .mockResolvedValueOnce(fakeRes({ ok: true, status: 200, json: content }))

    const result = await fetchContent()

    // First non-forced, then forced.
    expect(mockGetIdToken).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenNthCalledWith(1, false)
    expect(mockGetIdToken).toHaveBeenNthCalledWith(2, true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result).toEqual(content)
  })

  test('persistent 401 (both attempts) → throws, no infinite loop', async () => {
    mockFetch
      .mockResolvedValueOnce(fakeRes({ ok: false, status: 401 }))
      .mockResolvedValueOnce(fakeRes({ ok: false, status: 401 }))

    await expect(fetchContent()).rejects.toThrow(/401/)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledTimes(2)
  })

  test('trailing slash on BASE is trimmed', async () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_API_URL', `${BASE}/`)
    mockFetch.mockResolvedValueOnce(fakeRes({ ok: true, status: 200, json: {} }))
    await fetchContent()
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE}/content`)
  })

  test('signed-out (null token) → request sent without Authorization header', async () => {
    // Simulate a signed-out user: getIdToken resolves to null.
    mockGetIdToken.mockResolvedValue(null)
    // Server would 403 such a request; the point here is to assert the header is absent.
    mockFetch.mockResolvedValueOnce(fakeRes({ ok: false, status: 403 }))

    await expect(fetchContent()).rejects.toThrow(/403/)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, init] = mockFetch.mock.calls[0]
    const headers = new Headers((init as RequestInit).headers)
    expect(headers.has('Authorization')).toBe(false)
  })
})

// ─── resolveUrls ──────────────────────────────────────────────────────────

describe('resolveUrls', () => {
  test('POSTs /resolve with JSON body {keys} + Content-Type, returns urls map', async () => {
    const urls = { 'images/a.jpg': 'https://signed/a' }
    mockFetch.mockResolvedValueOnce(fakeRes({ ok: true, status: 200, json: { urls } }))

    const result = await resolveUrls(['images/a.jpg'])

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(`${BASE}/resolve`)
    expect((init as RequestInit).method).toBe('POST')
    const headers = new Headers((init as RequestInit).headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Authorization')).toBe('Bearer tok-123')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ keys: ['images/a.jpg'] })
    expect(result).toEqual(urls)
  })

  test('missing urls in response → {}', async () => {
    mockFetch.mockResolvedValueOnce(fakeRes({ ok: true, status: 200, json: {} }))
    expect(await resolveUrls(['images/a.jpg'])).toEqual({})
  })

  test('empty keys → {} without a request', async () => {
    const result = await resolveUrls([])
    expect(result).toEqual({})
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('non-ok throws including status', async () => {
    mockFetch.mockResolvedValueOnce(fakeRes({ ok: false, status: 400 }))
    await expect(resolveUrls(['images/a.jpg'])).rejects.toThrow(/400/)
  })
})

// ─── readMarkdown ─────────────────────────────────────────────────────────

describe('readMarkdown', () => {
  test('GETs /read?key=<encoded> and returns text', async () => {
    mockFetch.mockResolvedValueOnce(fakeRes({ ok: true, status: 200, text: '# Hi' }))

    const result = await readMarkdown('research/x.md')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(`${BASE}/read?key=research%2Fx.md`)
    const headers = new Headers((init as RequestInit).headers)
    expect(headers.get('Authorization')).toBe('Bearer tok-123')
    expect(result).toBe('# Hi')
  })

  test('non-ok (403) throws including status', async () => {
    mockFetch.mockResolvedValueOnce(fakeRes({ ok: false, status: 403 }))
    await expect(readMarkdown('secret.md')).rejects.toThrow(/403/)
  })
})

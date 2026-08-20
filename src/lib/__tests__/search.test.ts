import { describe, test, expect, vi, beforeEach } from 'vitest'
import { runSearch } from '@/lib/search'

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { getIdToken: async () => 'tok' } },
}))

beforeEach(() => { vi.restoreAllMocks() })

describe('runSearch', () => {
  test('sends the query and the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ total: 0, hits: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await runSearch('polyester prince')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('q=polyester+prince')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok')
  })

  test('an empty query short-circuits with no request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await runSearch('   ')).toEqual({ total: 0, hits: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    await expect(runSearch('x')).rejects.toThrow(/503/)
  })

  test('passes limit and offset through', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ total: 0, hits: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await runSearch('x', { limit: 25, offset: 50 })
    expect(String(fetchMock.mock.calls[0][0])).toContain('limit=25')
    expect(String(fetchMock.mock.calls[0][0])).toContain('offset=50')
  })

  test('encodes a Devanagari query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ total: 0, hits: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await runSearch('योग')
    expect(String(fetchMock.mock.calls[0][0])).toContain(encodeURIComponent('योग'))
  })
})

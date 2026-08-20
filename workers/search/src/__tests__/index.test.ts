import { describe, test, expect, vi, beforeEach } from 'vitest'
import worker, { type Env } from '../index'
import * as auth from '../auth'
import * as allocation from '../allocation'

const INDEX = {
  version: 1,
  docs: [
    { comicId: 'biographies__a', line: 'biographies', slug: 'a', subject_slug: 's1',
      program_slug: 'p1', title: 'A', lang: 'en', page: 3,
      text: 'We will make our own polyester', refs: ['p3.pl1.b1'] },
    { comicId: 'indic__b', line: 'indic', slug: 'b', subject_slug: 's2',
      program_slug: 'p2', title: 'B', lang: 'en', page: 1,
      text: 'Polyester is not in this epic', refs: ['p1.pl1.b1'] },
  ],
}

function env(): Env {
  return {
    SEARCH_BUCKET: {
      get: async () => ({ text: async () => JSON.stringify(INDEX) }),
    } as unknown as R2Bucket,
    INDEX_CACHE: {} as KVNamespace,
    FIREBASE_PROJECT_ID: 'studio-whence-dpb',
    ADMIN_EMAIL: 'adnan@thothica.com',
    ALLOWED_ORIGINS: 'http://localhost:5509',
  }
}

const req = (url: string) =>
  new Request(url, { headers: { Authorization: 'Bearer t', Origin: 'http://localhost:5509' } })

beforeEach(() => {
  vi.restoreAllMocks()
  // The isolate-lifetime index cache would otherwise leak between tests.
  vi.spyOn(auth, 'verifyToken').mockResolvedValue({ email: 'm@dpb.in' })
})

describe('GET /search', () => {
  test('403s without a valid token', async () => {
    vi.spyOn(auth, 'verifyToken').mockResolvedValue(null)
    const res = await worker.fetch(req('https://w/search?q=polyester'), env())
    expect(res.status).toBe(403)
  })

  test('403s when the caller is not allowlisted', async () => {
    vi.spyOn(allocation, 'readCaller').mockResolvedValue(null)
    const res = await worker.fetch(req('https://w/search?q=polyester'), env())
    expect(res.status).toBe(403)
  })

  test('a moderator sees hits from every line', async () => {
    vi.spyOn(allocation, 'readCaller').mockResolvedValue({
      caller: { email: 'a@thothica.com', moderator: true }, alloc: null,
    })
    const res = await worker.fetch(req('https://w/search?q=polyester'), env())
    const body = await res.json() as { total: number }
    expect(body.total).toBe(2)
  })

  test('a member sees ONLY allocated comics — the gate runs before the response', async () => {
    vi.spyOn(allocation, 'readCaller').mockResolvedValue({
      caller: { email: 'm@dpb.in', moderator: false },
      alloc: { lines: ['biographies'], figures: [], comics: [], programs: [] },
    })
    const res = await worker.fetch(req('https://w/search?q=polyester'), env())
    const body = await res.json() as { total: number; hits: { comicId: string }[] }
    expect(body.total).toBe(1)
    expect(body.hits[0].comicId).toBe('biographies__a')
    // The unallocated comic's TEXT must not appear anywhere in the payload.
    expect(JSON.stringify(body)).not.toContain('indic__b')
    expect(JSON.stringify(body)).not.toContain('not in this epic')
  })

  test('a missing q is a 400', async () => {
    vi.spyOn(allocation, 'readCaller').mockResolvedValue({
      caller: { email: 'm@dpb.in', moderator: true }, alloc: null,
    })
    const res = await worker.fetch(req('https://w/search'), env())
    expect(res.status).toBe(400)
  })

  test('a non-search path is a 404', async () => {
    vi.spyOn(allocation, 'readCaller').mockResolvedValue({
      caller: { email: 'm@dpb.in', moderator: true }, alloc: null,
    })
    const res = await worker.fetch(req('https://w/something'), env())
    expect(res.status).toBe(404)
  })

  test('OPTIONS preflight needs no auth and carries the allowed origin', async () => {
    const res = await worker.fetch(
      new Request('https://w/search', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5509' } }),
      env(),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5509')
  })

  test('an unknown origin gets no CORS header', async () => {
    const res = await worker.fetch(
      new Request('https://w/search', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }),
      env(),
    )
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

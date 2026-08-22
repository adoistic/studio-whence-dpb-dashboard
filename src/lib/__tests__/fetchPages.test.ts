import { describe, test, expect, vi } from 'vitest'
import { fetchPagesWithFallback } from '@/lib/exportFetch'

const pairs = [
  { webKey: 'w1', masterKey: 'm1' },
  { webKey: 'w2', masterKey: 'm2' },
]
const urls = { w1: 'W1', w2: 'W2', m1: 'M1', m2: 'M2' }
const bytes = (s: string) => new TextEncoder().encode(s)

describe('fetchPagesWithFallback', () => {
  test('uses the web variant when it serves', async () => {
    const fetchBytes = vi.fn(async (u: string) => bytes(u))
    const out = await fetchPagesWithFallback(pairs, urls, true, fetchBytes)
    expect(out.map((b) => b && new TextDecoder().decode(b))).toEqual(['W1', 'W2'])
  })

  test('FALLS BACK to the master when the web variant 404s', async () => {
    // /resolve presigns a URL whether or not the object exists, so a missing
    // web variant is only discovered by FETCHING it. This is the actual bug:
    // 29 comics have no web derivatives and every low-res download 404'd.
    const fetchBytes = vi.fn(async (u: string) => (u.startsWith('W') ? null : bytes(u)))
    const out = await fetchPagesWithFallback(pairs, urls, true, fetchBytes)
    expect(out.map((b) => b && new TextDecoder().decode(b))).toEqual(['M1', 'M2'])
    expect(fetchBytes).toHaveBeenCalledWith('W1')
    expect(fetchBytes).toHaveBeenCalledWith('M1')
  })

  test('falls back per page — a partially derived comic still completes', async () => {
    const fetchBytes = vi.fn(async (u: string) => (u === 'W2' ? null : bytes(u)))
    const out = await fetchPagesWithFallback(pairs, urls, true, fetchBytes)
    expect(out.map((b) => b && new TextDecoder().decode(b))).toEqual(['W1', 'M2'])
  })

  test('preferWeb=false goes straight to the masters and never asks for web', async () => {
    const fetchBytes = vi.fn(async (u: string) => bytes(u))
    const out = await fetchPagesWithFallback(pairs, urls, false, fetchBytes)
    expect(out.map((b) => b && new TextDecoder().decode(b))).toEqual(['M1', 'M2'])
    expect(fetchBytes).not.toHaveBeenCalledWith('W1')
  })

  test('a page that fails both ways is null, and ORDER is preserved', async () => {
    const fetchBytes = vi.fn(async (u: string) => (u.endsWith('1') ? null : bytes(u)))
    const out = await fetchPagesWithFallback(pairs, urls, true, fetchBytes)
    expect(out[0]).toBeNull()
    expect(out[1] && new TextDecoder().decode(out[1])).toBe('W2')
  })

  test('an unresolved key is not fetched at all', async () => {
    const fetchBytes = vi.fn(async () => bytes('x'))
    const out = await fetchPagesWithFallback([{ webKey: 'nope', masterKey: 'alsonope' }], {}, true, fetchBytes)
    expect(out).toEqual([null])
    expect(fetchBytes).not.toHaveBeenCalled()
  })
})

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

// Phase-B0 data-driven routing depends on the ORDER of hosting.rewrites in
// firebase.json: the gated data API (`/api/**` -> dataApi Cloud Function) MUST
// come before the catch-all (`/*` -> /line.html). If they ever flip, every
// /api/** request would be served line.html and the gated data channel would
// break silently. This test locks that order so a regression fails CI.

// Vitest runs with process.cwd() at the repo root, so firebase.json resolves
// from there.
const firebaseJsonPath = path.resolve(process.cwd(), 'firebase.json')

type Rewrite = {
  source: string
  destination?: string
  function?: { functionId?: string; region?: string }
}

const config = JSON.parse(readFileSync(firebaseJsonPath, 'utf8')) as {
  hosting?: { rewrites?: Rewrite[] }
}
const rewrites = config.hosting?.rewrites ?? []

describe('firebase.json hosting rewrites', () => {
  test('hosting.rewrites is a non-empty array', () => {
    expect(Array.isArray(rewrites)).toBe(true)
    expect(rewrites.length).toBeGreaterThan(0)
  })

  test('the gated data API (/api/**) is the FIRST rewrite', () => {
    expect(rewrites[0].source).toBe('/api/**')
    expect(rewrites[0].function?.functionId).toBe('dataApi')
  })

  test('the line catch-all (/* -> /line.html) is the LAST rewrite', () => {
    const last = rewrites[rewrites.length - 1]
    expect(last).toEqual({ source: '/*', destination: '/line.html' })
  })

  test('the /api/** rewrite comes BEFORE the /* catch-all (the invariant that matters)', () => {
    const apiIndex = rewrites.findIndex((r) => r.source === '/api/**')
    const catchAllIndex = rewrites.findIndex((r) => r.source === '/*')
    expect(apiIndex).toBeGreaterThanOrEqual(0)
    expect(catchAllIndex).toBeGreaterThanOrEqual(0)
    expect(apiIndex).toBeLessThan(catchAllIndex)
  })
})

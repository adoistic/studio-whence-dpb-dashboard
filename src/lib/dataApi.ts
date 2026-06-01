'use client'

/**
 * dataApi.ts — token-bearing client fetch helpers for the gated dataApi Cloud
 * Function. Every request carries the caller's Firebase ID token as
 * `Authorization: Bearer <token>`. The Function exposes:
 *
 *   GET  {BASE}/content            → the full content.json (JSON body)
 *   POST {BASE}/resolve {keys[]}   → { urls: { [key]: presignedUrl } } (≤50 keys)
 *   GET  {BASE}/read?key=<r2key>   → a single markdown file as inline text
 *
 * {BASE} = NEXT_PUBLIC_DATA_API_URL (the deployed Function URL). The routes are
 * appended; a trailing slash on BASE is trimmed so `${BASE}/content` is clean.
 *
 * Auth failures always return 403 from the Function (per the spec / acceptance
 * gate), so the 401-retry branch below is a purely defensive safety net.
 */

import { auth } from '@/lib/firebase'
import type { Content } from '@/types/content'

/** Resolve the Function base URL, with any trailing slash trimmed. */
function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_DATA_API_URL ?? '').replace(/\/+$/, '')
}

/**
 * Current user's Firebase ID token, or null if signed out.
 * Pass forceRefresh=true to bypass the SDK cache (used on a 401 retry).
 */
async function getIdToken(forceRefresh = false): Promise<string | null> {
  return (await auth.currentUser?.getIdToken(forceRefresh)) ?? null
}

/**
 * Fetch `${BASE}${path}` with a Bearer token. Returns the Response; callers
 * inspect `res.ok`.
 *
 * 401-retry rationale: `getIdToken(false)` already auto-refreshes a near-expiry
 * token via the Firebase SDK cache, so the common token-expiry case is handled
 * before the request goes out. The current Function returns 403 for all auth
 * failures (per the design / acceptance gate), so this 401 branch is a
 * defensive safety net that won't fire against the current server — it's kept
 * cheap and harmless in case the backend ever distinguishes 401 (authn) from
 * 403 (authz). One force-refresh + one retry, no loop.
 */
async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${baseUrl()}${path}`

  const send = async (forceRefresh: boolean): Promise<Response> => {
    const token = await getIdToken(forceRefresh)
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(url, { ...init, headers })
  }

  const res = await send(false)
  if (res.status === 401) {
    return send(true)
  }
  return res
}

/** The full content.json. Throws on a non-ok response. */
export async function fetchContent(): Promise<Content> {
  const res = await authedFetch('/content')
  if (!res.ok) throw new Error(`content fetch failed: ${res.status}`)
  return (await res.json()) as Content
}

/**
 * Resolve R2 keys to presigned URLs. Empty input short-circuits to {} with no
 * request. Throws on a non-ok response.
 */
export async function resolveUrls(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {}
  const res = await authedFetch('/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  })
  if (!res.ok) throw new Error(`resolve failed: ${res.status}`)
  const data = (await res.json()) as { urls?: Record<string, string> }
  return data.urls ?? {}
}

/** Read a single markdown file as text. Throws on a non-ok response. */
export async function readMarkdown(key: string): Promise<string> {
  const res = await authedFetch(`/read?key=${encodeURIComponent(key)}`)
  if (!res.ok) throw new Error(`read failed: ${res.status}`)
  return await res.text()
}

/**
 * auth.ts — who is calling, and may they.
 *
 * The Worker holds NO privileged Firestore credential. It verifies the caller's
 * Firebase ID token against Google's published JWKS, then (in allocation.ts)
 * forwards that same token to the Firestore REST API to read only the three
 * documents the security rules already let a user read about themselves. A
 * compromise of this Worker therefore leaks nothing a signed-in user could not
 * already fetch from their own browser.
 *
 * Fails CLOSED on every error path: a missing header, a bad signature, an
 * unreachable Firestore, a suspended account — all return null.
 */
import { jwtVerify, createLocalJWKSet, type JSONWebKeySet } from 'jose'

export interface Caller {
  email: string
  moderator: boolean
}

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

// Google rotates these keys roughly daily; an isolate-lifetime cache is both
// correct and cheap. A fetch failure clears it, so a rotation recovers on the
// next request rather than wedging the Worker.
let cachedKeys: { keys: JSONWebKeySet; at: number } | null = null
const KEY_TTL_MS = 60 * 60 * 1000

async function googleKeys(): Promise<JSONWebKeySet> {
  const now = Date.now()
  if (cachedKeys && now - cachedKeys.at < KEY_TTL_MS) return cachedKeys.keys
  const res = await fetch(JWKS_URL)
  if (!res.ok) throw new Error(`jwks fetch failed: ${res.status}`)
  const keys = (await res.json()) as JSONWebKeySet
  cachedKeys = { keys, at: now }
  return keys
}

/** Verify against a supplied key set. Split out so it is testable without network access. */
export async function verifyTokenWithKeys(
  token: string, projectId: string, keys: JSONWebKeySet,
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, createLocalJWKSet(keys), {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    })
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    if (!email) return null
    return { email }
  } catch {
    return null
  }
}

/** Verify a Firebase ID token against Google's live JWKS. */
export async function verifyToken(
  token: string, projectId: string,
): Promise<{ email: string } | null> {
  try {
    return await verifyTokenWithKeys(token, projectId, await googleKeys())
  } catch {
    cachedKeys = null
    return null
  }
}

/** Bearer token from an Authorization header, or null. */
export function bearer(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

/**
 * CORS headers for an origin, or none at all when the origin is not allowed —
 * the browser then blocks the response. Mirrors the Cloud Function's applyCors.
 */
export function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  const base: Record<string, string> = { Vary: 'Origin' }
  if (!origin) return base
  const list = allowed.split(',').map((o) => o.trim()).filter(Boolean)
  if (!list.includes(origin)) return base
  return { ...base, 'Access-Control-Allow-Origin': origin }
}

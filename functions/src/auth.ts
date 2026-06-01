/**
 * auth.ts — server-side authorization gate for the gated data backbone.
 *
 * `authorize(req)` is the AUTHORITATIVE access check. It verifies the caller's
 * Firebase ID token, then applies the same email rule the client uses for UX
 * (`src/lib/auth.ts` `classifyByEmail`) and the Firestore `isAllowlisted()`
 * rule — so this Function and those two stay byte-for-byte equivalent:
 *
 *   1. empty email                → deny
 *   2. email === ADMIN_EMAIL      → allow   (default adnan@thothica.com)
 *   3. email ends @thothica.com   → allow
 *   4. email ends @dpb.in         → allow
 *   5. /allowlist/{email} exists  → allow   (any role counts)
 *   6. otherwise                  → deny
 *
 * Fail CLOSED on ANY error (missing/garbled header, verifyIdToken throws,
 * Firestore throws): return null. Never grant access on error.
 */

import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Initialize the default app exactly once. In Cloud Functions this uses
// Application Default Credentials — no service-account JSON in the repo.
if (getApps().length === 0) {
  initializeApp()
}

/** A minimal request shape: we only ever touch the Authorization header. */
export interface AuthRequestLike {
  headers: Record<string, string | string[] | undefined>
  get?: (header: string) => string | undefined
}

const DEFAULT_ADMIN_EMAIL = 'adnan@thothica.com'

/** Normalize an email/identifier the same way everywhere: trim + lowercase. */
function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/** Pull the configured admin email (env override, else the default). */
function adminEmail(): string {
  return normalize(process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL)
}

/**
 * Extract the bearer token from a request. Case-insensitive on the `Bearer`
 * scheme, tolerant of extra whitespace. Returns null when absent/malformed.
 */
function extractBearer(req: AuthRequestLike): string | null {
  let raw: string | undefined

  const fromHeaders = req.headers?.authorization
  if (typeof fromHeaders === 'string') {
    raw = fromHeaders
  } else if (Array.isArray(fromHeaders)) {
    raw = fromHeaders[0]
  }

  if (raw === undefined && typeof req.get === 'function') {
    raw = req.get('authorization')
  }

  if (typeof raw !== 'string') return null

  const match = /^\s*Bearer\s+(.+?)\s*$/i.exec(raw)
  if (!match) return null

  const token = match[1].trim()
  return token.length > 0 ? token : null
}

/**
 * Classify an email by rules 1–4 (no Firestore). Returns true to ALLOW,
 * false to DENY, or null to signal that an /allowlist lookup is required.
 * Mirrors the client `classifyByEmail` (admin/domain) exactly.
 */
function classifyByEmail(email: string): true | null {
  if (!email) return null // empty → caller treats null+empty as deny
  if (email === adminEmail()) return true
  if (email.endsWith('@thothica.com')) return true
  if (email.endsWith('@dpb.in')) return true
  return null
}

/**
 * Authorize a request. Returns `{ email }` (NORMALIZED) on allow, or `null`
 * on deny. Fails closed on every error path.
 */
export async function authorize(
  req: AuthRequestLike
): Promise<{ email: string } | null> {
  try {
    const token = extractBearer(req)
    if (!token) return null

    const decoded = await getAuth().verifyIdToken(token)
    const email = normalize(decoded.email)
    if (!email) return null

    // Rules 2–4: admin / allowed domains.
    if (classifyByEmail(email) === true) return { email }

    // Rule 5: Firestore allowlist. Any existing doc counts as allow.
    const snap = await getFirestore()
      .collection('allowlist')
      .doc(email)
      .get()
    if (snap.exists) return { email }

    // Rule 6: no match → deny.
    return null
  } catch {
    // Fail closed on any error (bad header, verify throws, Firestore throws).
    return null
  }
}

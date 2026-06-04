/**
 * auth.ts — server-side authorization gate for the gated data backbone.
 *
 * `authorize(req)` is the AUTHORITATIVE access check. It verifies the caller's
 * Firebase ID token, then applies the same email rules the client uses for UX
 * (`src/lib/auth.ts` `classifyByEmail`) and the Firestore `isAllowlisted()`
 * rule. The three allow-conditions (admin email, @thothica.com, @dpb.in) are
 * kept in sync with the client in the same order, BUT the signatures differ
 * deliberately: this server version reads ADMIN_EMAIL from env and takes an
 * already-normalized email; the client version takes adminEmail as a parameter
 * and normalizes internally. If you update the admin rule here, also update
 * the client `src/lib/auth.ts` `classifyByEmail` — and vice versa.
 *
 *   1. empty email                → deny
 *   2. /suspended/{email} exists  → deny    (overrides every allow below)
 *   3. email === ADMIN_EMAIL      → allow   (default adnan@thothica.com)
 *   4. email ends @thothica.com   → allow
 *   5. email ends @dpb.in         → allow
 *   6. /allowlist/{email} exists  → allow   (any role counts)
 *   7. otherwise                  → deny
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

  // The `\s*$` anchor collapses trailing whitespace into the non-capturing
  // suffix for non-edge inputs, but the lazy `.+?` can still capture a single
  // space when the input is "Bearer   " (all whitespace after the scheme).
  // Use a tighter pattern that excludes leading/trailing whitespace from the
  // capture group explicitly, so no post-match .trim() is needed.
  const match = /^\s*Bearer\s+(\S.*?\S|\S)\s*$/i.exec(raw)
  if (!match) return null

  return match[1]
}

/**
 * Classify an email by rules 1–4 (no Firestore). Returns `true` to allow
 * immediately (admin email, @thothica.com, or @dpb.in), or `null` to signal
 * that a Firestore /allowlist lookup is required. An empty email also returns
 * `null`; the caller treats null + no allowlist doc as deny. There is no
 * `false` return — only `true | null`.
 */
function classifyByEmail(email: string): true | null {
  if (!email) return null // empty → caller treats null+empty as deny
  if (email === adminEmail()) return true
  if (email.endsWith('@thothica.com')) return true
  if (email.endsWith('@dpb.in')) return true
  return null
}

/**
 * Authorize a request. Returns `{ email, moderator }` (email NORMALIZED) on
 * allow, or `null` on deny. Fails closed on every error path.
 *
 * `moderator` is the bypass flag for the allocation gate (work-allocation
 * feature): it is `true` when the caller is the admin (env `ADMIN_EMAIL`) OR
 * holds an `allowlist/{email}` doc whose `role === 'sub_admin'`. Admin +
 * sub-admins see every work; plain members are restricted to allocated works.
 *
 * IMPORTANT: domain users (@thothica / @dpb.in) used to short-circuit BEFORE
 * the allowlist read. We now ALWAYS read `allowlist/{email}` once we've decided
 * the caller is allowed, so a domain user who is also a sub_admin (an allowlist
 * doc with `role: 'sub_admin'`) is correctly reported as a moderator.
 */
export async function authorize(
  req: AuthRequestLike
): Promise<{ email: string; moderator: boolean } | null> {
  try {
    const token = extractBearer(req)
    if (!token) return null

    const decoded = await getAuth().verifyIdToken(token)
    const email = normalize(decoded.email)
    if (!email) return null

    const fs = getFirestore()

    // Rule 2: suspension overrides every allow below — even a domain/admin
    // email loses R2 access once a /suspended/{email} doc exists.
    const suspendedSnap = await fs.collection('suspended').doc(email).get()
    if (suspendedSnap.exists) return null

    // Admin email → allowed AND moderator, with no allowlist read needed.
    if (email === adminEmail()) return { email, moderator: true }

    // Read the allowlist doc once. It serves two purposes now:
    //   - it can grant access (Rule 6: any existing doc allows a non-domain
    //     user), and
    //   - its `role` field decides moderator status (`sub_admin`).
    // We read it even for domain users so a sub_admin domain user is flagged.
    const snap = await fs.collection('allowlist').doc(email).get()
    const role = snap.exists
      ? (snap.data?.() as { role?: string } | undefined)?.role
      : undefined
    const moderator = role === 'sub_admin'

    // Rules 4–5: admin / allowed domains → allowed (moderator iff sub_admin).
    if (classifyByEmail(email) === true) return { email, moderator }

    // Rule 6: Firestore allowlist. Any existing doc counts as allow.
    if (snap.exists) return { email, moderator }

    // Rule 7: no match → deny.
    return null
  } catch {
    // Fail closed on any error (bad header, verify throws, Firestore throws).
    return null
  }
}

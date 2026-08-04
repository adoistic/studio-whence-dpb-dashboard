'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AllowStatus =
  | 'admin'
  | 'sub_admin'
  | 'allow'
  /**
   * Read-everything, act-on-nothing (allowlist role 'viewer'). Sees whatever
   * their allocation grants — but no approvals, even from a @dpb.in address
   * that would otherwise carry Diamond sign-off powers. First holder:
   * ankur@dpb.in (Adnan, 2026-08-04 — "so he can also see it", prices and
   * approvals excluded). Enforced in rules too (isViewer), not just here.
   */
  | 'viewer'
  | 'pending'
  | 'suspended'
  | 'loading'

/** True for roles that can moderate (approve/hide/edit-any) feedback. */
export function canModerate(status: AllowStatus): boolean {
  return status === 'admin' || status === 'sub_admin'
}

// ─── Pure classifier (admin email only, no Firestore) ─────────────────────────
//
// Only the admin email is determinable from the email string alone: a domain
// user might be suspended, and an allowlisted user might be a sub_admin, so
// both require a Firestore lookup. Returns 'admin' for the admin email, or null
// to signal that the suspended + allowlist lookups are required. adminEmail is
// passed in (not read from env) so the function is deterministically
// unit-testable with no side effects.

export function classifyByEmail(
  email: string | null | undefined,
  adminEmail: string | undefined,
): 'admin' | null {
  const e = (email ?? '').trim().toLowerCase()
  if (!e) return null
  if (adminEmail && e === adminEmail.trim().toLowerCase()) return 'admin'
  return null
}

// ─── useUser ──────────────────────────────────────────────────────────────────
//
// Subscribes to Firebase Auth state.  `loading` starts true and flips to
// false after the first onAuthStateChanged callback, so callers can
// distinguish "not yet resolved" from "signed out".

export function useUser(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return { user, loading }
}

// ─── useAllowStatus ───────────────────────────────────────────────────────────
//
// Signature:  useAllowStatus(user: User | null | undefined, authLoading: boolean) → AllowStatus
//
// Designed for the (authed)/layout.tsx to call as:
//   const { user, loading } = useUser()
//   const status = useAllowStatus(user, loading)
//
// Behaviour:
//   - authLoading true or user === undefined → 'loading'
//   - user === null (signed out)             → 'pending'  (fail-closed; layout redirects to /login)
//   - classifyByEmail returns 'admin'          → return immediately, no Firestore call
//   - classifyByEmail returns null             → look up suspended/{email} + allowlist/{email}
//       - in-flight                            → 'loading'
//       - suspended/{email} exists             → 'suspended'  (denied, even for a domain email)
//       - else allowlist/{email} exists:
//           - role === 'sub_admin'             → 'sub_admin'
//           - role === 'admin'                 → 'admin'
//           - role === 'viewer'                → 'viewer' (read-only, no approvals)
//           - any other role                   → 'allow'
//       - else allowlist/{email} missing:
//           - @thothica.com / @dpb.in domain   → 'allow'
//           - otherwise                        → 'pending'
//       - fetch error (fail-closed)            → 'pending'

export function useAllowStatus(
  user: User | null | undefined,
  authLoading: boolean,
): AllowStatus {
  const [status, setStatus] = useState<AllowStatus>('loading')

  // Key the effect on the resolved email so it re-runs when the user changes.
  const email = user?.email ?? null
  // Normalize for the Firestore doc-key lookup so it matches the server-side
  // gate (dataApi Cloud Function `authorize`), which always lowercases the
  // email before keying /allowlist/{email}.  classifyByEmail already handles
  // its own lowercasing internally — only the doc-key path needs this.
  const normalizedEmail = email ? email.trim().toLowerCase() : null

  useEffect(() => {
    // 1. Auth not yet resolved or no user object at all.
    if (authLoading || user === undefined) {
      setStatus('loading')
      return
    }

    // 2. Signed out.
    if (user === null) {
      setStatus('pending')
      return
    }

    // 3. The admin email is the only status determinable without a lookup.
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL
    const quick = classifyByEmail(email, adminEmail)
    if (quick !== null) {
      setStatus(quick)
      return
    }

    // 4. Need Firestore lookups: suspended/{email} (deny) + allowlist/{email}.
    if (!normalizedEmail) {
      // Signed-in user with no email — treat as pending.
      setStatus('pending')
      return
    }

    let cancelled = false
    setStatus('loading')

    const isDomain =
      normalizedEmail.endsWith('@thothica.com') ||
      normalizedEmail.endsWith('@dpb.in')

    Promise.all([
      getDoc(doc(db, 'suspended', normalizedEmail)),
      getDoc(doc(db, 'allowlist', normalizedEmail)),
    ])
      .then(([suspendedSnap, allowSnap]) => {
        if (cancelled) return
        // Suspension wins over everything (even a domain email).
        if (suspendedSnap.exists()) {
          setStatus('suspended')
          return
        }
        if (allowSnap.exists()) {
          const role = allowSnap.data()?.role
          setStatus(
            role === 'sub_admin'
              ? 'sub_admin'
              : role === 'admin'
                ? 'admin'
                : role === 'viewer'
                  ? 'viewer'
                  : 'allow',
          )
          return
        }
        // No allowlist doc — fall back to the domain rule.
        setStatus(isDomain ? 'allow' : 'pending')
      })
      .catch(() => {
        // Fail closed — never grant access on error.
        if (!cancelled) setStatus('pending')
      })

    return () => {
      cancelled = true
    }
    // `normalizedEmail` is the only value the effect acts on for the Firestore
    // path; `user` is read only to distinguish undefined/null, and both map to
    // normalizedEmail=null. Keying on `normalizedEmail` (not the `user` object)
    // avoids re-fetching the lookups every time Firebase hands back a fresh
    // User instance for the same account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedEmail, authLoading])

  return status
}

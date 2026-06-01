'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AllowStatus = 'admin' | 'allow' | 'pending' | 'loading'

// ─── Pure classifier (rules 1–3, no Firestore) ────────────────────────────────
//
// Returns 'admin' or 'allow' when the email alone is sufficient to grant
// access, or null to signal that a Firestore /allowlist lookup (rule 4) is
// required.  adminEmail is passed in (not read from env) so the function is
// deterministically unit-testable with no side effects.

export function classifyByEmail(
  email: string | null | undefined,
  adminEmail: string | undefined,
): 'admin' | 'allow' | null {
  const e = (email ?? '').trim().toLowerCase()
  if (!e) return null
  if (adminEmail && e === adminEmail.trim().toLowerCase()) return 'admin'
  if (e.endsWith('@thothica.com')) return 'allow'
  if (e.endsWith('@dpb.in')) return 'allow'
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
//   - classifyByEmail returns 'admin'/'allow'  → return immediately, no Firestore call
//   - classifyByEmail returns null             → look up /allowlist/{email}
//       - in-flight                            → 'loading'
//       - doc exists, role === 'admin'         → 'admin'
//       - doc exists, any other role           → 'allow'
//       - doc missing                          → 'pending'
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

    // 3. Try to classify by email alone (rules 1–3).
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL
    const quick = classifyByEmail(email, adminEmail)
    if (quick !== null) {
      setStatus(quick)
      return
    }

    // 4. Need a Firestore lookup (rule 4).
    if (!normalizedEmail) {
      // Signed-in user with no email — treat as pending.
      setStatus('pending')
      return
    }

    let cancelled = false
    setStatus('loading')

    getDoc(doc(db, 'allowlist', normalizedEmail))
      .then((snap) => {
        if (cancelled) return
        if (!snap.exists()) {
          setStatus('pending')
          return
        }
        const role = snap.data()?.role
        setStatus(role === 'admin' ? 'admin' : 'allow')
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
    // avoids re-fetching the allowlist every time Firebase hands back a fresh
    // User instance for the same account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedEmail, authLoading])

  return status
}

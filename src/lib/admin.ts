'use client'

import { useEffect, useState } from 'react'
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toMillis } from '@/lib/feedbackTypes'

// ─── Shared async one-shot (mirrors catalog.ts useAsync) ─────────────────────────

export interface Async<T> { data: T | null; loading: boolean; error?: Error }

function useAsync<T>(run: () => Promise<T>, deps: unknown[]): Async<T> {
  const [s, setS] = useState<Async<T>>({ data: null, loading: true })
  useEffect(() => {
    let active = true
    // Re-arm the loading flag without dropping already-fetched data, so a
    // refreshKey-driven reload doesn't blank the list mid-flight.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setS((prev) => ({ data: prev.data, loading: true, error: undefined }))
    run()
      .then((data) => { if (active) setS({ data, loading: false }) })
      .catch((err) => { if (active) setS({ data: null, loading: false, error: err instanceof Error ? err : new Error(String(err)) }) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return s
}

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface AccessRequest {
  email: string
  requested_at?: unknown
  user_agent?: string
  resolved?: boolean
  resolution?: string | null
}
export interface Member {
  email: string
  role: 'sub_admin' | 'member'
  added_by?: string
  added_at?: unknown
}
export interface SuspendedEntry {
  email: string
  suspended_by?: string
  suspended_at?: unknown
}

// ─── Helpers ───────────────────────────────────────────────────────────────────────

/** Canonical key for allowlist/suspended docs: trimmed + lowercased. */
export function normalizeEmail(e: string): string {
  return e.trim().toLowerCase()
}

// ─── Read hooks (one-shot; component bumps refreshKey to reload after a write) ────

export function usePendingRequests(refreshKey: number): Async<AccessRequest[]> {
  return useAsync<AccessRequest[]>(async () => {
    const snap = await getDocs(collection(db, 'access_requests'))
    return snap.docs
      .map((d) => ({ email: d.id, ...(d.data() as object) }) as AccessRequest)
      // Filter client-side so we don't need a composite/order index.
      .filter((r) => r.resolved !== true)
      .sort((a, b) => toMillis(b.requested_at) - toMillis(a.requested_at))
  }, [refreshKey])
}

export function useMembers(refreshKey: number): Async<Member[]> {
  return useAsync<Member[]>(async () => {
    const snap = await getDocs(collection(db, 'allowlist'))
    return snap.docs
      .map((d) => {
        const data = d.data() as { role?: unknown }
        return {
          email: d.id,
          ...(data as object),
          role: data.role === 'sub_admin' ? 'sub_admin' : 'member',
        } as Member
      })
      // Sub-admins first, then alphabetical by email.
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'sub_admin' ? -1 : 1
        return a.email.localeCompare(b.email)
      })
  }, [refreshKey])
}

export function useSuspended(refreshKey: number): Async<SuspendedEntry[]> {
  return useAsync<SuspendedEntry[]>(async () => {
    const snap = await getDocs(collection(db, 'suspended'))
    return snap.docs
      .map((d) => ({ email: d.id, ...(d.data() as object) }) as SuspendedEntry)
      .sort((a, b) => a.email.localeCompare(b.email))
  }, [refreshKey])
}

// ─── Mutations ─────────────────────────────────────────────────────────────────────

interface AdminCtx { adminEmail: string }

/**
 * Approve a pending access request. Writes the allowlist doc keyed on the
 * lowercased request id, then marks the request resolved (using its RAW id).
 */
export async function approveRequest(
  requestId: string,
  { asSubAdmin, adminEmail }: { asSubAdmin: boolean } & AdminCtx,
): Promise<void> {
  await setDoc(doc(db, 'allowlist', normalizeEmail(requestId)), {
    role: asSubAdmin ? 'sub_admin' : 'member',
    added_by: adminEmail,
    added_at: serverTimestamp(),
  })
  await updateDoc(doc(db, 'access_requests', requestId), {
    resolved: true,
    resolution: asSubAdmin ? 'approved_sub_admin' : 'approved',
  })
}

export async function denyRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, 'access_requests', requestId), {
    resolved: true,
    resolution: 'denied',
  })
}

export async function addMember(
  email: string,
  { asSubAdmin, adminEmail }: { asSubAdmin: boolean } & AdminCtx,
): Promise<void> {
  await setDoc(doc(db, 'allowlist', normalizeEmail(email)), {
    role: asSubAdmin ? 'sub_admin' : 'member',
    added_by: adminEmail,
    added_at: serverTimestamp(),
  })
}

export async function setMemberRole(
  email: string,
  role: 'sub_admin' | 'member',
  _ctx: AdminCtx,
): Promise<void> {
  void _ctx
  await updateDoc(doc(db, 'allowlist', normalizeEmail(email)), { role })
}

export async function removeMember(email: string): Promise<void> {
  await deleteDoc(doc(db, 'allowlist', normalizeEmail(email)))
}

export async function suspendEmail(
  email: string,
  { adminEmail }: AdminCtx,
): Promise<void> {
  await setDoc(doc(db, 'suspended', normalizeEmail(email)), {
    suspended_by: adminEmail,
    suspended_at: serverTimestamp(),
  })
}

export async function reinstate(email: string): Promise<void> {
  await deleteDoc(doc(db, 'suspended', normalizeEmail(email)))
}

/**
 * Tests for src/lib/auth.ts
 *
 * Coverage:
 *   - classifyByEmail  (pure function — no React, no Firestore)
 *   - useAllowStatus   (hook — mocks Firestore; uses renderHook)
 *
 * Firebase modules are mocked so NO network calls happen.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { classifyByEmail, useAllowStatus } from '@/lib/auth'

// ─── Firebase mocks ───────────────────────────────────────────────────────────

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}))

// We control getDoc's resolved value per test. The hook now issues TWO reads
// in parallel — suspended/{email} and allowlist/{email} — so the mock routes by
// collection: `mockSuspendedGet` answers the suspended ref, `mockGetDoc` the
// allowlist ref. `mockGetDoc` is still asserted on as the allowlist read.
const mockGetDoc = vi.fn()
const mockSuspendedGet = vi.fn()
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id })),
  getDoc: (ref: { collection?: string }) =>
    ref?.collection === 'suspended' ? mockSuspendedGet(ref) : mockGetDoc(ref),
}))

// useAllowStatus does NOT call onAuthStateChanged — that's useUser's job.
// We feed user objects directly to the hook, so no auth mock needed.

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal Firebase User-like object for testing. */
function fakeUser(email: string | null): User {
  return { email } as unknown as User
}

/** Make getDoc resolve to a document that exists with the given data. */
function mockDocExists(data: Record<string, unknown>) {
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    data: () => data,
  })
}

/** Make getDoc resolve to a missing document. */
function mockDocMissing() {
  mockGetDoc.mockResolvedValue({
    exists: () => false,
    data: () => undefined,
  })
}

/** Make getDoc reject with an error. */
function mockDocError() {
  mockGetDoc.mockRejectedValue(new Error('Firestore unavailable'))
}

/** Make the suspended/{email} lookup resolve to an existing doc. */
function mockSuspended() {
  mockSuspendedGet.mockResolvedValue({ exists: () => true, data: () => ({}) })
}

/** Default: not suspended (suspended/{email} missing). */
function mockNotSuspended() {
  mockSuspendedGet.mockResolvedValue({ exists: () => false, data: () => undefined })
}

// ─── classifyByEmail ──────────────────────────────────────────────────────────

describe('classifyByEmail — admin-only classification (no Firestore)', () => {
  // classifyByEmail now resolves ONLY the admin email without a lookup; every
  // other email (including the allowed domains) returns null, because a domain
  // user might be suspended and an allowlisted user might be a sub_admin — both
  // require the Firestore lookups in useAllowStatus.
  const ADMIN = 'admin@thothica.com'

  test('admin email → "admin"', () => {
    expect(classifyByEmail(ADMIN, ADMIN)).toBe('admin')
  })

  test('@thothica.com non-admin email → null (lookup required)', () => {
    expect(classifyByEmail('editor@thothica.com', ADMIN)).toBeNull()
  })

  test('@dpb.in email → null (lookup required)', () => {
    expect(classifyByEmail('reviewer@dpb.in', ADMIN)).toBeNull()
  })

  test('@gmail.com email → null (Firestore lookup required)', () => {
    expect(classifyByEmail('someone@gmail.com', ADMIN)).toBeNull()
  })

  test('null email → null', () => {
    expect(classifyByEmail(null, ADMIN)).toBeNull()
  })

  test('undefined email → null', () => {
    expect(classifyByEmail(undefined, ADMIN)).toBeNull()
  })

  test('empty string email → null', () => {
    expect(classifyByEmail('', ADMIN)).toBeNull()
  })

  test('case-insensitive: ADMIN@THOTHICA.COM → "admin"', () => {
    expect(classifyByEmail('ADMIN@THOTHICA.COM', ADMIN)).toBe('admin')
  })

  test('adminEmail undefined (env unset) — admin email → null (admin check skipped)', () => {
    // When adminEmail is undefined the admin-email check is skipped entirely,
    // so even the admin address resolves to null and falls to the lookups.
    expect(classifyByEmail('admin@thothica.com', undefined)).toBeNull()
  })

  test('adminEmail undefined (env unset) — @gmail.com email → null', () => {
    expect(classifyByEmail('someone@gmail.com', undefined)).toBeNull()
  })

  test('whitespace-only email → null', () => {
    expect(classifyByEmail('   ', ADMIN)).toBeNull()
  })
})

// ─── useAllowStatus ───────────────────────────────────────────────────────────

describe('useAllowStatus — hook tests', () => {
  const ADMIN_EMAIL = 'admin@thothica.com'

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_EMAIL', ADMIN_EMAIL)
    mockGetDoc.mockReset()
    mockSuspendedGet.mockReset()
    // Default: nobody suspended, so the allowlist/domain path decides.
    mockNotSuspended()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // ── Rule 1: admin email (no Firestore) ──────────────────────────────────────

  test('admin-email user → "admin" without calling getDoc', async () => {
    const user = fakeUser(ADMIN_EMAIL)
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('admin'))
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  // ── @thothica.com domain (no allowlist doc → domain fallback → 'allow') ──────

  test('@thothica.com user, no allowlist doc → "allow" (domain fallback)', async () => {
    mockDocMissing()
    const user = fakeUser('editor@thothica.com')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('allow'))
  })

  // ── @dpb.in domain (no allowlist doc → domain fallback → 'allow') ────────────

  test('@dpb.in user, no allowlist doc → "allow" (domain fallback)', async () => {
    mockDocMissing()
    const user = fakeUser('reviewer@dpb.in')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('allow'))
  })

  // ── @dpb.in with a sub_admin allowlist doc → "sub_admin" ─────────────────────

  test('@dpb.in user with allowlist doc (role: "sub_admin") → "sub_admin"', async () => {
    mockDocExists({ role: 'sub_admin' })
    const user = fakeUser('reviewer@dpb.in')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('sub_admin'))
  })

  // ── Suspended domain user → "suspended" (overrides the domain allow) ─────────

  test('@thothica.com user who is suspended → "suspended"', async () => {
    mockSuspended()
    mockDocMissing()
    const user = fakeUser('banned@thothica.com')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('suspended'))
  })

  // ── Rule 4: Firestore lookup — role: editor → 'allow' ───────────────────────

  test('@gmail.com user with Firestore doc (role: "editor") → "allow"', async () => {
    mockDocExists({ role: 'editor' })
    const user = fakeUser('partner@gmail.com')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('allow'))
    expect(mockGetDoc).toHaveBeenCalledOnce()
  })

  // ── Rule 4: Firestore lookup — role: admin → 'admin' ────────────────────────

  test('@gmail.com user with Firestore doc (role: "admin") → "admin"', async () => {
    mockDocExists({ role: 'admin' })
    const user = fakeUser('superuser@gmail.com')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('admin'))
    expect(mockGetDoc).toHaveBeenCalledOnce()
  })

  // ── Rule 4: Firestore lookup — doc missing → 'pending' ──────────────────────

  test('@gmail.com user with missing Firestore doc → "pending"', async () => {
    mockDocMissing()
    const user = fakeUser('stranger@gmail.com')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('pending'))
    expect(mockGetDoc).toHaveBeenCalledOnce()
  })

  // ── Fail-closed: Firestore error → 'pending' ────────────────────────────────

  test('@gmail.com user with Firestore error → "pending" (fail-closed)', async () => {
    mockDocError()
    const user = fakeUser('risky@gmail.com')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('pending'))
    expect(mockGetDoc).toHaveBeenCalledOnce()
  })

  // ── Rule 4: uppercase email — doc key must be lowercased ────────────────────

  test('mixed-case email with no domain match → doc() called with lowercased key', async () => {
    mockDocMissing()
    const user = fakeUser('Mixed.Case@Gmail.com')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    // The status should resolve to 'pending' (doc missing).
    await waitFor(() => expect(result.current).toBe('pending'))
    // The critical assertion: doc() must have been called with the lowercased
    // key, not the raw mixed-case email.
    const { doc: mockDoc } = await import('firebase/firestore')
    expect(mockDoc).toHaveBeenCalledWith(
      expect.anything(),    // db
      'allowlist',
      'mixed.case@gmail.com',
    )
    // And NOT with the original casing.
    const calls = (mockDoc as ReturnType<typeof vi.fn>).mock.calls
    const keys = calls.map((c: unknown[]) => c[2])
    expect(keys).not.toContain('Mixed.Case@Gmail.com')
  })

  test('mixed-case email — allow-listed doc resolves correctly', async () => {
    mockDocExists({ role: 'editor' })
    const user = fakeUser('Partner@Gmail.Com')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('allow'))
    expect(mockGetDoc).toHaveBeenCalledOnce()
  })

  // ── null user (signed out) → 'pending' ──────────────────────────────────────

  test('null user (signed out) → "pending"', async () => {
    const { result } = renderHook(() =>
      useAllowStatus(null, false),
    )
    await waitFor(() => expect(result.current).toBe('pending'))
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  // ── authLoading true → 'loading' ────────────────────────────────────────────

  test('authLoading true → "loading"', () => {
    const { result } = renderHook(() =>
      useAllowStatus(undefined, true),
    )
    // Stays loading immediately — no async resolution expected.
    expect(result.current).toBe('loading')
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  // ── undefined user → 'loading' ──────────────────────────────────────────────

  test('undefined user + authLoading false → "loading" (auth not resolved)', () => {
    const { result } = renderHook(() =>
      useAllowStatus(undefined, false),
    )
    expect(result.current).toBe('loading')
    expect(mockGetDoc).not.toHaveBeenCalled()
  })
})

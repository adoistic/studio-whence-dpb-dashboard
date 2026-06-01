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

// We control getDoc's resolved value per test.
const mockGetDoc = vi.fn()
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, _collection: string, id: string) => ({ id })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
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

// ─── classifyByEmail ──────────────────────────────────────────────────────────

describe('classifyByEmail — pure classification (no Firestore)', () => {
  const ADMIN = 'admin@thothica.com'

  test('admin email → "admin"', () => {
    expect(classifyByEmail(ADMIN, ADMIN)).toBe('admin')
  })

  test('@thothica.com non-admin email → "allow"', () => {
    expect(classifyByEmail('editor@thothica.com', ADMIN)).toBe('allow')
  })

  test('@dpb.in email → "allow"', () => {
    expect(classifyByEmail('reviewer@dpb.in', ADMIN)).toBe('allow')
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

  test('case-insensitive: EDITOR@THOTHICA.COM → "allow"', () => {
    expect(classifyByEmail('EDITOR@THOTHICA.COM', ADMIN)).toBe('allow')
  })

  test('case-insensitive: REVIEWER@DPB.IN → "allow"', () => {
    expect(classifyByEmail('REVIEWER@DPB.IN', ADMIN)).toBe('allow')
  })

  test('adminEmail undefined (env unset) — admin email is NOT matched as admin, falls to domain check', () => {
    // When adminEmail is undefined the admin-email check is skipped entirely.
    // 'admin@thothica.com' still gets 'allow' via the @thothica.com domain rule.
    expect(classifyByEmail('admin@thothica.com', undefined)).toBe('allow')
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

  // ── Rule 2: @thothica.com (no Firestore) ────────────────────────────────────

  test('@thothica.com user → "allow" without calling getDoc', async () => {
    const user = fakeUser('editor@thothica.com')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('allow'))
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  // ── Rule 3: @dpb.in (no Firestore) ──────────────────────────────────────────

  test('@dpb.in user → "allow" without calling getDoc', async () => {
    const user = fakeUser('reviewer@dpb.in')
    const { result } = renderHook(() =>
      useAllowStatus(user, false),
    )
    await waitFor(() => expect(result.current).toBe('allow'))
    expect(mockGetDoc).not.toHaveBeenCalled()
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

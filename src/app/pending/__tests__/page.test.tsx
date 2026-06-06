/**
 * Tests for src/app/pending/page.tsx
 *
 * Mocking strategy follows the forwarding-arrow pattern (hoisting-safe):
 * module-level vi.fn() stubs are declared before vi.mock() calls so the
 * factory closures capture live references and avoid TDZ errors.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import PendingPage from '../page'

// ─── Forwarding stubs (declared before vi.mock calls) ─────────────────────────

// @/lib/auth
let mockUserState: { user: { email: string } | null; loading: boolean } = {
  user: { email: 'someone@gmail.com' },
  loading: false,
}

// firebase/firestore
const mockDoc = vi.fn()
const mockSetDoc = vi.fn()
const mockServerTimestamp = vi.fn()

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  useUser: () => mockUserState,
}))

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: {},
}))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
}))

// SignOutButton (rendered when a user is signed in) depends on these.
vi.mock('firebase/auth', () => ({
  signOut: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/pending page', () => {
  beforeEach(() => {
    mockUserState = { user: { email: 'someone@gmail.com' }, loading: false }
    mockDoc.mockReset()
    mockSetDoc.mockReset()
    mockServerTimestamp.mockReset()

    // Default: doc returns a marker ref; setDoc resolves successfully.
    mockDoc.mockImplementation((_db: unknown, collection: string, id: string) => ({
      _collection: collection,
      _id: id,
    }))
    mockSetDoc.mockResolvedValue(undefined)
    mockServerTimestamp.mockReturnValue({ _type: 'serverTimestamp' })
  })

  // ── Test 1: renders awaiting message ──────────────────────────────────────

  test('renders the awaiting-access message', () => {
    render(<PendingPage />)

    expect(
      screen.getByText("You're awaiting access. Adnan has been notified."),
    ).toBeInTheDocument()
  })

  // ── Test 2: calls setDoc on mount with correct args ───────────────────────

  test('calls setDoc once on mount with correct access_requests payload', async () => {
    render(<PendingPage />)

    await waitFor(() => {
      expect(mockDoc).toHaveBeenCalledWith({}, 'access_requests', 'someone@gmail.com')
      expect(mockSetDoc).toHaveBeenCalledOnce()
    })

    const [, payload] = mockSetDoc.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.resolved).toBe(false)
    expect(payload.resolution).toBeNull()
    expect(payload).toHaveProperty('requested_at')
    expect(payload).toHaveProperty('user_agent')
  })

  // ── Test 3: signed-in user sees a Sign out button (can switch accounts) ────

  test('shows a Sign out button when a user/email is present', () => {
    mockUserState = { user: { email: 'someone@gmail.com' }, loading: false }
    render(<PendingPage />)

    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    // The not-signed-in "Sign in" link should NOT appear when signed in.
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
  })

  // ── Test 4: not-signed-in user keeps the "Sign in" link, no Sign out ───────

  test('shows the Sign in link (and no Sign out) when no user is present', () => {
    mockUserState = { user: null, loading: false }
    render(<PendingPage />)

    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })
})

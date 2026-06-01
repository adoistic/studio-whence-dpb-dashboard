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
}))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
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
})

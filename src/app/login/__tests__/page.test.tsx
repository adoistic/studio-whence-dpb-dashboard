/**
 * Tests for src/app/login/page.tsx
 *
 * Happy-path: the page renders a "Sign in with Google" button and clicking
 * it calls signInWithPopup.
 *
 * Mocking strategy follows the forwarding-arrow pattern from
 * src/lib/__tests__/auth.test.ts to avoid "cannot access before initialization"
 * errors when vi.mock factories reference module-level vi.fn() variables.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '../page'

// ─── Forwarding stubs (declared before vi.mock calls) ────────────────────────

// next/navigation
const mockRouterReplace = vi.fn()

// firebase/auth
const mockSignInWithPopup = vi.fn()

// @/lib/auth — useUser
let mockUserState: { user: null; loading: boolean } = { user: null, loading: false }

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}))

vi.mock('firebase/auth', () => ({
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {},
  googleProvider: {},
}))

vi.mock('@/lib/auth', () => ({
  useUser: () => mockUserState,
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/login page', () => {
  beforeEach(() => {
    mockRouterReplace.mockReset()
    mockSignInWithPopup.mockReset()
    mockUserState = { user: null, loading: false }
  })

  test('renders Sign in with Google button and clicking it calls signInWithPopup', async () => {
    mockSignInWithPopup.mockResolvedValue({})

    render(<LoginPage />)

    const button = screen.getByRole('button', { name: /sign in with google/i })
    expect(button).toBeInTheDocument()
    expect(button).not.toBeDisabled()

    fireEvent.click(button)

    await waitFor(() => {
      expect(mockSignInWithPopup).toHaveBeenCalledOnce()
      expect(mockSignInWithPopup).toHaveBeenCalledWith({}, {})
    })
  })
})

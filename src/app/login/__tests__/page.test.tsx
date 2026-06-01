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
const mockSendSignInLinkToEmail = vi.fn()
const mockIsSignInWithEmailLink = vi.fn((_auth: unknown, _link: unknown) => false)
const mockSignInWithEmailLink = vi.fn()

// @/lib/auth — useUser
let mockUserState: { user: null; loading: boolean } = { user: null, loading: false }

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}))

vi.mock('firebase/auth', () => ({
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  sendSignInLinkToEmail: (...args: unknown[]) => mockSendSignInLinkToEmail(...args),
  // isSignInWithEmailLink is synchronous (returns boolean); forward with explicit signature
  isSignInWithEmailLink: (auth: unknown, link: unknown) => mockIsSignInWithEmailLink(auth, link),
  signInWithEmailLink: (...args: unknown[]) => mockSignInWithEmailLink(...args),
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
    mockSendSignInLinkToEmail.mockReset()
    mockIsSignInWithEmailLink.mockReset().mockReturnValue(false)
    mockSignInWithEmailLink.mockReset()
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

  test('submitting the email form calls sendSignInLinkToEmail and shows confirmation', async () => {
    mockSendSignInLinkToEmail.mockResolvedValue(undefined)

    render(<LoginPage />)

    const emailInput = screen.getByLabelText(/email/i)
    fireEvent.change(emailInput, { target: { value: 'adnan@thothica.com' } })

    const submitButton = screen.getByRole('button', { name: /email me a sign-in link/i })
    fireEvent.click(submitButton)

    // Wait for the confirmation to appear (the promise has resolved and state updated)
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Check your email for a sign-in link.')
    })

    expect(mockSendSignInLinkToEmail).toHaveBeenCalledOnce()
    expect(mockSendSignInLinkToEmail).toHaveBeenCalledWith(
      {},
      'adnan@thothica.com',
      expect.objectContaining({ handleCodeInApp: true }),
    )
    // localStorage.setItem is called synchronously after the await inside the handler
    expect(window.localStorage.getItem('emailForSignIn')).toBe('adnan@thothica.com')

    // clean up
    window.localStorage.removeItem('emailForSignIn')
  })

  test('when isSignInWithEmailLink is true and localStorage has email, completes sign-in on mount', async () => {
    mockIsSignInWithEmailLink.mockReturnValue(true)
    mockSignInWithEmailLink.mockResolvedValue({})
    window.localStorage.setItem('emailForSignIn', 'x@thothica.com')

    render(<LoginPage />)

    await waitFor(() => {
      expect(mockSignInWithEmailLink).toHaveBeenCalledWith(
        {},
        'x@thothica.com',
        window.location.href,
      )
      expect(mockRouterReplace).toHaveBeenCalledWith('/')
    })

    // After the sign-in promise resolves, the stored email should be cleared
    expect(window.localStorage.getItem('emailForSignIn')).toBeNull()
  })
})

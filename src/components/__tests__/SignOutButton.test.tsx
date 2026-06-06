/**
 * Tests for src/components/SignOutButton.tsx
 *
 * The reusable Sign out control: it must call signOut(auth) and then, once that
 * resolves, navigate to /login. Mocks mirror Topbar.test.tsx (firebase/auth's
 * signOut, @/lib/firebase's auth, next/navigation's useRouter).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SignOutButton } from '../SignOutButton'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase', () => ({
  auth: {},
}))

const mockSignOut = vi.fn()
vi.mock('firebase/auth', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}))

const mockRouterReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SignOutButton', () => {
  beforeEach(() => {
    mockSignOut.mockReset()
    mockRouterReplace.mockReset()
    mockSignOut.mockResolvedValue(undefined)
  })

  test('renders a button with the default "Sign out" label', () => {
    render(<SignOutButton />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  test('clicking it calls signOut(auth)', async () => {
    render(<SignOutButton />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledOnce())
    // signOut receives the auth instance (the mocked {} object)
    expect(mockSignOut).toHaveBeenCalledWith({})
  })

  test('clicking it navigates to /login after signOut resolves', async () => {
    render(<SignOutButton />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/login'))
  })

  test('accepts custom children as the label', () => {
    render(<SignOutButton>Log out</SignOutButton>)
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
  })

  test('applies a custom className when provided', () => {
    render(<SignOutButton className="custom-class" />)
    expect(screen.getByRole('button', { name: /sign out/i })).toHaveClass('custom-class')
  })
})

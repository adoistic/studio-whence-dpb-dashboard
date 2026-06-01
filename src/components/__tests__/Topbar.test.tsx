/**
 * Tests for src/components/Topbar.tsx
 *
 * Coverage:
 *   1. Nav links + user email render when signed in
 *   2. Admin link absent for 'allow' status; present for 'admin' status
 *   3. Sign out button calls signOut (and router.replace)
 *
 * All external dependencies are mocked — no Firebase, no Next.js router calls.
 * Uses the forwarding-arrow pattern so vi.fn() values are safe under hoisting.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { Topbar } from '../Topbar'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Forwarding-arrow pattern: the module-level const is hoisted before imports;
// using an arrow that calls through to mockImpl means we can reassign mockImpl
// per test without breaking the mock factory.

let mockUseUser: () => { user: User | null; loading: boolean }
let mockUseAllowStatus: () => 'admin' | 'allow' | 'pending' | 'loading'

vi.mock('@/lib/auth', () => ({
  useUser: () => mockUseUser(),
  useAllowStatus: () => mockUseAllowStatus(),
}))

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
  usePathname: () => '/',
}))

// BrandLockup renders the wordmark; we keep it real (no mock needed).

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeUser(email: string): User {
  return { email } as unknown as User
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Topbar — nav links and user email', () => {
  beforeEach(() => {
    mockSignOut.mockReset()
    mockRouterReplace.mockReset()
    mockSignOut.mockResolvedValue(undefined)

    // Default: signed in as allow user
    mockUseUser = () => ({ user: fakeUser('x@thothica.com'), loading: false })
    mockUseAllowStatus = () => 'allow'
  })

  test('renders all five nav links (Home, Biographies, Awareness, Indic, Toddlers)', () => {
    render(<Topbar />)
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /biographies/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /awareness/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /indic/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /toddlers/i })).toBeInTheDocument()
  })

  test('renders the signed-in user email', () => {
    render(<Topbar />)
    expect(screen.getByText('x@thothica.com')).toBeInTheDocument()
  })

  test('renders Sign out button', () => {
    render(<Topbar />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  test('does NOT render email or sign-out when user is null', () => {
    mockUseUser = () => ({ user: null, loading: false })
    render(<Topbar />)
    expect(screen.queryByText('x@thothica.com')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })
})

describe('Topbar — Admin link visibility', () => {
  beforeEach(() => {
    mockUseUser = () => ({ user: fakeUser('x@thothica.com'), loading: false })
  })

  test('Admin link is NOT present when useAllowStatus returns "allow"', () => {
    mockUseAllowStatus = () => 'allow'
    render(<Topbar />)
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument()
  })

  test('Admin link IS present when useAllowStatus returns "admin"', () => {
    mockUseAllowStatus = () => 'admin'
    render(<Topbar />)
    expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument()
  })
})

describe('Topbar — Sign out', () => {
  beforeEach(() => {
    mockSignOut.mockReset()
    mockRouterReplace.mockReset()
    mockSignOut.mockResolvedValue(undefined)
    mockUseUser = () => ({ user: fakeUser('x@thothica.com'), loading: false })
    mockUseAllowStatus = () => 'allow'
  })

  test('clicking Sign out calls signOut', async () => {
    render(<Topbar />)
    const btn = screen.getByRole('button', { name: /sign out/i })
    fireEvent.click(btn)
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledOnce())
  })

  test('clicking Sign out navigates to /login after signOut resolves', async () => {
    render(<Topbar />)
    const btn = screen.getByRole('button', { name: /sign out/i })
    fireEvent.click(btn)
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/login'))
  })
})

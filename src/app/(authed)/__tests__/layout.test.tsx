/**
 * Tests for src/app/(authed)/layout.tsx
 *
 * Verifies the auth gate matrix:
 *   loading            → quiet "Checking access" placeholder; no redirect, no children
 *   user null          → "Checking access" placeholder; redirects to /login
 *   status 'pending'   → "Checking access" placeholder; redirects to /pending
 *   status 'allow'     → renders children + Topbar; no redirect
 *   status 'admin'     → renders children + Topbar; no redirect
 *
 * Mocking strategy follows the forwarding-arrow hoisting-safe pattern used in
 * the other auth tests, to avoid "cannot access before initialization" errors.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AuthedLayout from '../layout'
import type { AllowStatus } from '@/lib/auth'
import type { User } from 'firebase/auth'

// ─── Forwarding stubs (declared before vi.mock calls) ────────────────────────

const mockReplace = vi.fn()

// Controllable auth state
let mockUseUserResult: { user: User | null | undefined; loading: boolean } = {
  user: undefined,
  loading: true,
}
let mockAllowStatus: AllowStatus = 'loading'

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

vi.mock('@/lib/auth', () => ({
  useUser: () => mockUseUserResult,
  useAllowStatus: (_user: unknown, _loading: boolean) => mockAllowStatus,
}))

vi.mock('@/components/Topbar', () => ({
  Topbar: () => <div data-testid="topbar" />,
}))

// FooterWithData reads the gated content channel; the layout test only cares
// that it is rendered in the authed branch, so stub it to a marker.
vi.mock('@/components/FooterWithData', () => ({
  FooterWithData: () => <div data-testid="footer" />,
}))

// ContentProvider wraps the authed children. Stub it to a passthrough so the
// real runtime fetch never runs in this unit test.
vi.mock('@/lib/content', () => ({
  ContentProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderLayout(children: React.ReactNode = <div data-testid="child" />) {
  return render(<AuthedLayout>{children}</AuthedLayout>)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('(authed)/layout — auth gate matrix', () => {
  beforeEach(() => {
    mockReplace.mockReset()
    // reset to loading state
    mockUseUserResult = { user: undefined, loading: true }
    mockAllowStatus = 'loading'
  })

  test('1. loading state — renders "Checking access", no children, no redirect', async () => {
    mockUseUserResult = { user: undefined, loading: true }
    mockAllowStatus = 'loading'

    renderLayout()

    // The quiet placeholder should appear, and announce as a status region
    expect(screen.getByText(/checking access/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    // Children and chrome must NOT be visible
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
    expect(screen.queryByTestId('topbar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('footer')).not.toBeInTheDocument()

    // Give effects a tick to run — redirect should NOT fire
    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  test('2. user null — renders placeholder, redirects to /login, no children', async () => {
    mockUseUserResult = { user: null, loading: false }
    // useAllowStatus contract: null user → 'pending' (fail-closed). The layout
    // checks !user *before* status, so the redirect target is /login, not /pending.
    mockAllowStatus = 'pending'

    renderLayout()

    expect(screen.getByText(/checking access/i)).toBeInTheDocument()
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login')
    })
  })

  test('3. status pending (user present) — renders placeholder, redirects to /pending, no children', async () => {
    mockUseUserResult = { user: { email: 'stranger@example.com' } as User, loading: false }
    mockAllowStatus = 'pending'

    renderLayout()

    expect(screen.getByText(/checking access/i)).toBeInTheDocument()
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/pending')
    })
  })

  test('4. status allow — renders children + Topbar + Footer, no redirect', async () => {
    mockUseUserResult = { user: { email: 'adnan@thothica.com' } as User, loading: false }
    mockAllowStatus = 'allow'

    renderLayout()

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByTestId('topbar')).toBeInTheDocument()
    expect(screen.getByTestId('footer')).toBeInTheDocument()
    expect(screen.queryByText(/checking access/i)).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  test('5. status admin — renders children too, no redirect', async () => {
    mockUseUserResult = { user: { email: 'admin@thothica.com' } as User, loading: false }
    mockAllowStatus = 'admin'

    renderLayout()

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByTestId('topbar')).toBeInTheDocument()
    expect(screen.getByTestId('footer')).toBeInTheDocument()
    expect(screen.queryByText(/checking access/i)).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled()
    })
  })
})

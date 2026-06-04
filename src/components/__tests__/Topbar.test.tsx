/**
 * Tests for src/components/Topbar.tsx
 *
 * Coverage:
 *   1. Line nav links derive from content.lines (data-driven) + Home + user email
 *   2. Null content → only non-line entries (Home, Admin if admin); no crash
 *   3. Active link highlights when usePathname() matches
 *   4. Admin link absent for 'allow' status; present for 'admin' status
 *   5. Sign out button calls signOut (and router.replace)
 *
 * All external dependencies are mocked — no Firebase, no Next.js router calls,
 * no content fetch. Uses the forwarding-arrow pattern so vi.fn()/fixture values
 * are safe under hoisting and reassignable per test.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Line } from '@/types/content'
import { Topbar } from '../Topbar'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Forwarding-arrow pattern: the module-level const is hoisted before imports;
// using an arrow that calls through to mockImpl means we can reassign mockImpl
// per test without breaking the mock factory.

let mockUseUser: () => { user: User | null; loading: boolean }
let mockUseAllowStatus: () => 'admin' | 'sub_admin' | 'allow' | 'pending' | 'loading'
let mockUseLines: () => { data: Line[] | null; loading: boolean }
let mockPathname: () => string

vi.mock('@/lib/auth', () => ({
  useUser: () => mockUseUser(),
  useAllowStatus: () => mockUseAllowStatus(),
  canModerate: (s: string) => s === 'admin' || s === 'sub_admin',
}))

vi.mock('@/lib/catalog', () => ({
  useLines: () => mockUseLines(),
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
  usePathname: () => mockPathname(),
}))

// BrandLockup renders the wordmark; we keep it real (no mock needed).

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeUser(email: string): User {
  return { email } as unknown as User
}

function fakeLine(slug: string, title: string): Line {
  return { slug, title, subtitle: '', comics: [], figures: [] }
}

const TWO_LINES: Line[] = [
  fakeLine('biographies', 'Business Legends'),
  fakeLine('bollywood-legends', 'Bollywood Legends'),
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Topbar — nav links and user email', () => {
  beforeEach(() => {
    mockSignOut.mockReset()
    mockRouterReplace.mockReset()
    mockSignOut.mockResolvedValue(undefined)

    // Default: signed in as allow user, content loaded with two lines, at '/'
    mockUseUser = () => ({ user: fakeUser('x@thothica.com'), loading: false })
    mockUseAllowStatus = () => 'allow'
    mockUseLines = () => ({ data: TWO_LINES, loading: false })
    mockPathname = () => '/'
  })

  test('renders Home plus a link per content line (data-driven, including the fifth/added line)', () => {
    render(<Topbar />)

    // Home is always first.
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()

    // Each content line renders with its title as label and /<slug> as href.
    const businessLink = screen.getByRole('link', { name: 'Business Legends' })
    expect(businessLink).toBeInTheDocument()
    expect(businessLink.getAttribute('href')).toBe('/biographies')

    // The second/added line proves the nav is fully data-driven.
    const bollywoodLink = screen.getByRole('link', { name: 'Bollywood Legends' })
    expect(bollywoodLink).toBeInTheDocument()
    expect(bollywoodLink.getAttribute('href')).toBe('/bollywood-legends')
  })

  test('renders only non-line entries (Home) when content is null — no crash', () => {
    mockUseLines = () => ({ data: null, loading: false })
    render(<Topbar />)

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Business Legends' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Bollywood Legends' })).toBeNull()
  })

  test('highlights the active line link when usePathname matches', () => {
    mockPathname = () => '/biographies'
    render(<Topbar />)

    const active = screen.getByRole('link', { name: 'Business Legends' })
    expect(active.getAttribute('aria-current')).toBe('page')

    // Non-matching links are not marked active.
    const home = screen.getByRole('link', { name: 'Home' })
    expect(home.getAttribute('aria-current')).toBeNull()
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
    mockUseLines = () => ({ data: TWO_LINES, loading: false })
    mockPathname = () => '/'
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

  test('Admin link still renders when content is null and status is "admin"', () => {
    mockUseAllowStatus = () => 'admin'
    mockUseLines = () => ({ data: null, loading: false })
    render(<Topbar />)
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Business Legends' })).toBeNull()
  })
})

describe('Topbar — Reviews link visibility (moderator-only)', () => {
  beforeEach(() => {
    mockUseUser = () => ({ user: fakeUser('x@thothica.com'), loading: false })
    mockUseLines = () => ({ data: TWO_LINES, loading: false })
    mockPathname = () => '/'
  })

  test('Reviews link is HIDDEN for a plain member ("allow")', () => {
    mockUseAllowStatus = () => 'allow'
    render(<Topbar />)
    // Home + line links still render for everyone.
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Business Legends' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /reviews/i })).not.toBeInTheDocument()
  })

  test('Reviews link is SHOWN for a moderator ("sub_admin")', () => {
    mockUseAllowStatus = () => 'sub_admin'
    render(<Topbar />)
    expect(screen.getByRole('link', { name: /reviews/i })).toBeInTheDocument()
  })

  test('Reviews link is SHOWN for the admin', () => {
    mockUseAllowStatus = () => 'admin'
    render(<Topbar />)
    expect(screen.getByRole('link', { name: /reviews/i })).toBeInTheDocument()
  })
})

describe('Topbar — Sign out', () => {
  beforeEach(() => {
    mockSignOut.mockReset()
    mockRouterReplace.mockReset()
    mockSignOut.mockResolvedValue(undefined)
    mockUseUser = () => ({ user: fakeUser('x@thothica.com'), loading: false })
    mockUseAllowStatus = () => 'allow'
    mockUseLines = () => ({ data: TWO_LINES, loading: false })
    mockPathname = () => '/'
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

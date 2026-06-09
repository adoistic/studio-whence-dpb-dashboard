/**
 * Tests for src/components/Topbar.tsx
 *
 * The top bar is hamburger-only at ALL widths. The bar itself shows only the
 * brand lockup (left) and a hamburger button (right). Everything else — Home,
 * Methodology, Reviews (moderators), the content lines, Admin (admins), the
 * signed-in email, and Sign out — lives inside a menu panel that opens when the
 * hamburger is clicked.
 *
 * Coverage:
 *   1. Bar renders the brand + a hamburger button; nav links are hidden until opened
 *   2. Clicking the hamburger opens the menu (Home/Methodology + lines + email/Sign out)
 *   3. Reviews appears only for moderators; Admin only for admins
 *   4. Active link highlights when usePathname() matches
 *   5. aria-expanded toggles; Escape closes; outside click closes
 *   6. Sign out calls signOut (and router.replace('/login'))
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

vi.mock('@/lib/ideas', () => ({
  useUnreadIdeaCount: () => 0,
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

/** Open the menu by clicking the hamburger toggle. */
function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Topbar — closed bar (hamburger-only)', () => {
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

  test('the bar shows the brand and a hamburger button', () => {
    render(<Topbar />)
    expect(screen.getByText('Studio Whence')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })

  test('nav links and email are NOT visible until the hamburger is clicked', () => {
    render(<Topbar />)
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Business Legends' })).toBeNull()
    expect(screen.queryByText('x@thothica.com')).toBeNull()
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull()
  })

  test('the hamburger reports aria-expanded=false when closed and points at the menu panel', () => {
    render(<Topbar />)
    const btn = screen.getByRole('button', { name: /open menu/i })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.getAttribute('aria-controls')).toBeTruthy()
  })
})

describe('Topbar — open menu contents', () => {
  beforeEach(() => {
    mockSignOut.mockReset()
    mockRouterReplace.mockReset()
    mockSignOut.mockResolvedValue(undefined)
    mockUseUser = () => ({ user: fakeUser('x@thothica.com'), loading: false })
    mockUseAllowStatus = () => 'allow'
    mockUseLines = () => ({ data: TWO_LINES, loading: false })
    mockPathname = () => '/'
  })

  test('clicking the hamburger reveals Home, Methodology and a link per content line', () => {
    render(<Topbar />)
    openMenu()

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Methodology' })).toBeInTheDocument()

    const businessLink = screen.getByRole('link', { name: 'Business Legends' })
    expect(businessLink).toBeInTheDocument()
    expect(businessLink.getAttribute('href')).toBe('/biographies')

    // The second/added line proves the menu is fully data-driven.
    const bollywoodLink = screen.getByRole('link', { name: 'Bollywood Legends' })
    expect(bollywoodLink).toBeInTheDocument()
    expect(bollywoodLink.getAttribute('href')).toBe('/bollywood-legends')
  })

  test('the open menu shows the signed-in email and Sign out button', () => {
    render(<Topbar />)
    openMenu()
    expect(screen.getByText('x@thothica.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  test('renders only non-line entries when content is null — no crash', () => {
    mockUseLines = () => ({ data: null, loading: false })
    render(<Topbar />)
    openMenu()

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Business Legends' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Bollywood Legends' })).toBeNull()
  })

  test('does NOT render email or sign-out when user is null', () => {
    mockUseUser = () => ({ user: null, loading: false })
    render(<Topbar />)
    openMenu()
    expect(screen.queryByText('x@thothica.com')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })

  test('highlights the active line link when usePathname matches', () => {
    mockPathname = () => '/biographies'
    render(<Topbar />)
    openMenu()

    const active = screen.getByRole('link', { name: 'Business Legends' })
    expect(active.getAttribute('aria-current')).toBe('page')

    const home = screen.getByRole('link', { name: 'Home' })
    expect(home.getAttribute('aria-current')).toBeNull()
  })

  test('clicking a link closes the menu', () => {
    render(<Topbar />)
    openMenu()
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull()
  })
})

describe('Topbar — Admin link visibility (in menu)', () => {
  beforeEach(() => {
    mockUseUser = () => ({ user: fakeUser('x@thothica.com'), loading: false })
    mockUseLines = () => ({ data: TWO_LINES, loading: false })
    mockPathname = () => '/'
  })

  test('Admin link is NOT present when useAllowStatus returns "allow"', () => {
    mockUseAllowStatus = () => 'allow'
    render(<Topbar />)
    openMenu()
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument()
  })

  test('Admin link IS present when useAllowStatus returns "admin"', () => {
    mockUseAllowStatus = () => 'admin'
    render(<Topbar />)
    openMenu()
    expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument()
  })

  test('Admin link still renders when content is null and status is "admin"', () => {
    mockUseAllowStatus = () => 'admin'
    mockUseLines = () => ({ data: null, loading: false })
    render(<Topbar />)
    openMenu()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Business Legends' })).toBeNull()
  })
})

describe('Topbar — Reviews link visibility (moderator-only, in menu)', () => {
  beforeEach(() => {
    mockUseUser = () => ({ user: fakeUser('x@thothica.com'), loading: false })
    mockUseLines = () => ({ data: TWO_LINES, loading: false })
    mockPathname = () => '/'
  })

  test('Reviews link is HIDDEN for a plain member ("allow")', () => {
    mockUseAllowStatus = () => 'allow'
    render(<Topbar />)
    openMenu()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Business Legends' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /reviews/i })).not.toBeInTheDocument()
  })

  test('Reviews link is SHOWN for a moderator ("sub_admin")', () => {
    mockUseAllowStatus = () => 'sub_admin'
    render(<Topbar />)
    openMenu()
    expect(screen.getByRole('link', { name: /reviews/i })).toBeInTheDocument()
  })

  test('Reviews link is SHOWN for the admin', () => {
    mockUseAllowStatus = () => 'admin'
    render(<Topbar />)
    openMenu()
    expect(screen.getByRole('link', { name: /reviews/i })).toBeInTheDocument()
  })
})

describe('Topbar — menu open/close behavior (a11y)', () => {
  beforeEach(() => {
    mockSignOut.mockReset()
    mockRouterReplace.mockReset()
    mockSignOut.mockResolvedValue(undefined)
    mockUseUser = () => ({ user: fakeUser('x@thothica.com'), loading: false })
    mockUseAllowStatus = () => 'allow'
    mockUseLines = () => ({ data: TWO_LINES, loading: false })
    mockPathname = () => '/'
  })

  test('aria-expanded toggles true when opened and false when closed', () => {
    render(<Topbar />)
    const btn = screen.getByRole('button', { name: /open menu/i })
    expect(btn.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(btn)
    const openBtn = screen.getByRole('button', { name: /close menu/i })
    expect(openBtn.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(openBtn)
    expect(screen.getByRole('button', { name: /open menu/i }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })

  test('the open menu panel is labelled "Main navigation"', () => {
    render(<Topbar />)
    openMenu()
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument()
  })

  test('pressing Escape closes the menu', () => {
    render(<Topbar />)
    openMenu()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull()
    expect(screen.getByRole('button', { name: /open menu/i }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })

  test('an outside click closes the menu', () => {
    render(
      <div>
        <Topbar />
        <button type="button">outside</button>
      </div>,
    )
    openMenu()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull()
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
    openMenu()
    const btn = screen.getByRole('button', { name: /sign out/i })
    fireEvent.click(btn)
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledOnce())
  })

  test('clicking Sign out navigates to /login after signOut resolves', async () => {
    render(<Topbar />)
    openMenu()
    const btn = screen.getByRole('button', { name: /sign out/i })
    fireEvent.click(btn)
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/login'))
  })
})

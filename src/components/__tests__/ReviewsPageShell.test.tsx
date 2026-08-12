import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { FeedbackNode } from '@/lib/feedbackTypes'

// ── helpers ────────────────────────────────────────────────────────────────────

const root = (over: Partial<FeedbackNode>): FeedbackNode => ({
  id: 'r',
  comicId: 'biographies__01-x',
  line: 'biographies',
  parentId: null,
  anchors: [],
  authorEmail: 'a@x.com',
  authorName: 'A',
  authorRole: 'allow',
  body: 'b',
  status: 'open',
  comicVersion: 1,
  hidden: false,
  published: true, // default to approved so existing fixtures stay out of the pending panel
  createdAt: '2026-06-03',
  ...over,
})

// ── mutable state so each test can set different data ──────────────────────────

let rootsData: FeedbackNode[] = []
let loadingFlag = false
let lastViewerCanModerate: boolean | undefined

const setPublishedSpy = vi.fn()
vi.mock('@/lib/feedback', () => ({
  useAllRoots: (viewerCanModerate: boolean) => {
    lastViewerCanModerate = viewerCanModerate
    return { data: rootsData, loading: loadingFlag }
  },
  setPublished: (...args: unknown[]) => setPublishedSpy(...args),
}))

vi.mock('@/lib/catalog', () => ({
  useComics: () => ({
    data: [{ line: 'biographies', slug: '01-x', title: 'Comic X' }],
    loading: false,
  }),
  useLines: () => ({ data: [], loading: false }),
}))

// The queue is scoped to the surface being browsed. Stub the SDK handles so the
// real surface module loads; with no active surface it filters nothing, which
// is what these assertions measure.
vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, googleProvider: {} }))

// `canModerate` mirrors the real predicate so the gated-read arg is genuinely derived.
let allowStatus = 'admin'
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: { email: 'me@x.com' }, loading: false }),
  useAllowStatus: () => allowStatus,
  canModerate: (s: string) => s === 'admin' || s === 'sub_admin',
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

// ── import after mocks are set up ──────────────────────────────────────────────

import { ReviewsPageShell } from '@/components/ReviewsPageShell'

// ── tests ──────────────────────────────────────────────────────────────────────

describe('ReviewsPageShell', () => {
  beforeEach(() => {
    rootsData = []
    loadingFlag = false
    allowStatus = 'admin'
    lastViewerCanModerate = undefined
    setPublishedSpy.mockClear()
  })

  it('passes viewerCanModerate to useAllRoots: true for admin/sub_admin, false for a member', () => {
    render(<ReviewsPageShell />)
    expect(lastViewerCanModerate).toBe(true) // admin (default)

    allowStatus = 'sub_admin'
    render(<ReviewsPageShell />)
    expect(lastViewerCanModerate).toBe(true)

    allowStatus = 'allow'
    render(<ReviewsPageShell />)
    expect(lastViewerCanModerate).toBe(false)
  })

  it('renders a row per root with comic title and deep-link', () => {
    rootsData = [
      root({ id: 'g1', body: 'General note', anchors: [] }),
      root({
        id: 't1',
        body: 'Anchored note',
        anchors: [{ kind: 'beat', ref: 'p13.pl1.b1', page: 13, panel: 1, snapshot: 's' }],
      }),
    ]
    render(<ReviewsPageShell />)

    expect(screen.getByText('General note')).toBeInTheDocument()
    expect(screen.getByText('Anchored note')).toBeInTheDocument()

    // At least one "Comic X" label appears (one per row)
    expect(screen.getAllByText('Comic X').length).toBeGreaterThan(0)

    // deep-link on the anchored row
    const link = screen.getByText('Anchored note').closest('a')
    expect(link).toHaveAttribute('href', '/biographies/01-x#feedback-t1')
  })

  it('builds the deep-link from comicId even when line is empty (no protocol-relative URL)', () => {
    // regression: an empty `line` previously produced `//comicId` → browser read it
    // as a hostname (NXDOMAIN). The href must derive line+slug from comicId.
    rootsData = [root({ id: 'r9', line: '', comicId: 'biographies__01-x', body: 'No-line note' })]
    render(<ReviewsPageShell />)
    const link = screen.getByText('No-line note').closest('a')
    expect(link).toHaveAttribute('href', '/biographies/01-x#feedback-r9')
  })

  it('Open filter shows only open roots', () => {
    rootsData = [
      root({ id: 'g1', body: 'General note', status: 'open', anchors: [] }),
      root({
        id: 'r1',
        body: 'Resolved note',
        status: 'resolved',
        anchors: [{ kind: 'beat', ref: 'p1.pl1.b1', page: 1, panel: 1, snapshot: 's' }],
      }),
    ]
    render(<ReviewsPageShell />)

    fireEvent.click(screen.getByRole('button', { name: /^open$/i }))

    expect(screen.queryByText('Resolved note')).toBeNull()
    expect(screen.getByText('General note')).toBeInTheDocument()
  })

  it('Anchored toggle hides general (unanchored) roots', () => {
    rootsData = [
      root({ id: 'g1', body: 'General note', status: 'open', anchors: [] }),
      root({
        id: 'a1',
        body: 'Anchored note',
        status: 'open',
        anchors: [{ kind: 'beat', ref: 'p2.pl1.b1', page: 2, panel: 1, snapshot: 's' }],
      }),
    ]
    render(<ReviewsPageShell />)

    fireEvent.click(screen.getByRole('button', { name: /anchored/i }))

    expect(screen.queryByText('General note')).toBeNull()
    expect(screen.getByText('Anchored note')).toBeInTheDocument()
  })

  it('Mine toggle filters to current user only', () => {
    rootsData = [
      root({ id: 'm1', body: 'My note', authorEmail: 'me@x.com', anchors: [] }),
      root({ id: 'o1', body: 'Other note', authorEmail: 'other@x.com', anchors: [] }),
    ]
    render(<ReviewsPageShell />)

    fireEvent.click(screen.getByRole('button', { name: /mine/i }))

    expect(screen.queryByText('Other note')).toBeNull()
    expect(screen.getByText('My note')).toBeInTheDocument()
  })

  it('shows empty state when no roots match filters', () => {
    rootsData = [root({ id: 'r1', body: 'Resolved note', status: 'resolved', anchors: [] })]
    render(<ReviewsPageShell />)

    fireEvent.click(screen.getByRole('button', { name: /^open$/i }))

    expect(screen.getByText(/no feedback matches/i)).toBeInTheDocument()
  })

  it('shows loading state while data is loading', () => {
    rootsData = []
    loadingFlag = true
    render(<ReviewsPageShell />)
    expect(screen.getByText(/loading feedback/i)).toBeInTheDocument()
    expect(screen.queryByText(/no feedback matches/i)).toBeNull()
    loadingFlag = false
  })

  // ── Pending-approval panel (sub-admin) ──────────────────────────────────────

  it.each(['sub_admin', 'admin'])(
    'shows a draft root in the Pending approval panel and Approve calls setPublished (%s)',
    (status) => {
      allowStatus = status
      rootsData = [
        root({ id: 'd1', body: 'Awaiting note', published: false, authorName: 'Reviewer R' }),
      ]
      render(<ReviewsPageShell />)

      // the draft appears in the dedicated panel (it also shows in the main list
      // below, which moderators legitimately see in full — so scope to the panel)
      const panel = screen.getByRole('region', { name: /pending approval/i })
      expect(panel).toHaveTextContent(/pending approval · 1/i)
      expect(within(panel).getByText('Awaiting note')).toBeInTheDocument()

      fireEvent.click(
        within(panel).getByRole('button', { name: /approve comment by reviewer r/i }),
      )

      expect(setPublishedSpy).toHaveBeenCalledWith(
        'd1',
        true,
        expect.objectContaining({ email: 'me@x.com' }),
      )
    },
  )

  it('renders a terminal not-authorized card for a member (no list, no panel)', () => {
    allowStatus = 'allow'
    rootsData = [root({ id: 'd1', body: 'Awaiting note', published: false })]
    render(<ReviewsPageShell />)

    // The whole cross-comic reviews surface is editorial-only: a member gets the
    // terminal gate, not the pending panel or the list.
    expect(screen.getByText(/not authorized/i)).toBeInTheDocument()
    expect(screen.getByText(/reviews are for editors/i)).toBeInTheDocument()
    expect(screen.queryByText(/pending approval/i)).toBeNull()
    expect(screen.queryByRole('heading', { name: /^reviews$/i })).toBeNull()
    expect(lastViewerCanModerate).toBe(false)
  })

  it('renders the reviews list (not the gate) for a moderator', () => {
    allowStatus = 'sub_admin'
    rootsData = [root({ id: 'a1', body: 'Approved note', published: true })]
    render(<ReviewsPageShell />)

    expect(screen.queryByText(/not authorized/i)).toBeNull()
    expect(screen.getByRole('heading', { name: /^reviews$/i })).toBeInTheDocument()
    expect(screen.getByText('Approved note')).toBeInTheDocument()
  })

  it('does not list an approved root in the pending panel', () => {
    allowStatus = 'admin'
    rootsData = [root({ id: 'a1', body: 'Approved note', published: true })]
    render(<ReviewsPageShell />)

    expect(screen.getByText(/pending approval · 0/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing awaiting approval/i)).toBeInTheDocument()
  })
})

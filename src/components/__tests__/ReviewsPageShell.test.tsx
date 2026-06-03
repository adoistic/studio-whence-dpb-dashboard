import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  createdAt: '2026-06-03',
  ...over,
})

// ── mutable state so each test can set different data ──────────────────────────

let rootsData: FeedbackNode[] = []
let loadingFlag = false

vi.mock('@/lib/feedback', () => ({
  useAllRoots: () => ({ data: rootsData, loading: loadingFlag }),
}))

vi.mock('@/lib/catalog', () => ({
  useComics: () => ({
    data: [{ line: 'biographies', slug: '01-x', title: 'Comic X' }],
    loading: false,
  }),
}))

vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: { email: 'me@x.com' }, loading: false }),
  useAllowStatus: () => 'admin',
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
  })

  it('renders a row per root with comic title and deep-link', () => {
    rootsData = [
      root({ id: 'g1', body: 'General note', anchors: [] }),
      root({
        id: 't1',
        body: 'Anchored note',
        anchors: [{ beatRef: 'p13.pl1.b1', page: 13, panel: 1, snapshot: 's' }],
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
        anchors: [{ beatRef: 'p1.pl1.b1', page: 1, panel: 1, snapshot: 's' }],
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
        anchors: [{ beatRef: 'p2.pl1.b1', page: 2, panel: 1, snapshot: 's' }],
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
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))

// Approvals store mocked; the pure derivation fns stay real via importOriginal.
const { approveSpy, unapproveSpy } = vi.hoisted(() => ({
  approveSpy: vi.fn(() => Promise.resolve()),
  unapproveSpy: vi.fn(() => Promise.resolve()),
}))
let approvalsData: Record<string, { approved: boolean; by: string; at: string }> = {}

vi.mock('@/lib/approvals', async (orig) => ({
  ...(await orig<typeof import('@/lib/approvals')>()),
  useApprovals: () => ({ data: approvalsData, loading: false }),
  approve: approveSpy,
  unapprove: unapproveSpy,
}))

import { StatusTable } from '@/components/StatusTable'
import type { Comic, Line, Program } from '@/types/content'

function comic(over: Partial<Comic> = {}): Comic {
  return {
    title: 'A Book',
    line: 'biographies',
    slug: 'a-book',
    subject_slug: 'someone',
    status: 'draft',
    target_length_pages: 48,
    created: '2026-05-01',
    pages: { hasPages: true, count: 24, coverKey: null },
    ...over,
  } as Comic
}

const LINES = [
  { slug: 'biographies', title: 'Biographies', subtitle: '', comics: [], figures: [] },
] as unknown as Line[]
const PROGRAMS = [{ slug: 'tech-legends', line: 'biographies', title: 'Tech Legends' }] as Program[]

const COMICS = [
  comic({ slug: 'jobs', title: 'Think Different', program_slug: 'tech-legends' }),
  comic({ slug: 'sachin', title: 'The Little Master', program_slug: 'tech-legends' }),
]

function setup(over: Partial<Parameters<typeof StatusTable>[0]> = {}) {
  return render(
    <StatusTable
      comics={COMICS}
      figures={null}
      lines={LINES}
      programs={PROGRAMS}
      pricing={null}
      email="editor@dpb.in"
      canModerate={false}
      canAdmin={false}
      {...over}
    />,
  )
}

beforeEach(() => {
  approveSpy.mockClear()
  unapproveSpy.mockClear()
  approvalsData = {}
})

describe('StatusTable', () => {
  it('shows every column Adnan asked for', () => {
    setup()
    for (const col of [
      'Classification', 'Sub-classification', 'Comic', 'Pages', '+ Covers & activities', 'Total',
      'Rate', 'Total value', 'Script', 'Dossier', 'Illustration', 'Complete set', 'Marketing', 'Diamond',
    ]) {
      expect(screen.getByText(col)).toBeInTheDocument()
    }
  })

  it('renders one row per comic with classification and sub-classification', () => {
    setup()
    expect(screen.getByText('Think Different')).toBeInTheDocument()
    expect(screen.getAllByText('Tech Legends').length).toBe(2)
  })

  it('shows a totals row that sums the visible rows', () => {
    setup()
    expect(screen.getByText(/Total · 2 comics/)).toBeInTheDocument()
    expect(screen.getByText('0 approved')).toBeInTheDocument()
  })

  it('lets Diamond approve, attributed to their email', async () => {
    setup()
    fireEvent.click(screen.getByLabelText('Approve Think Different'))
    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith('biographies__jobs', 'editor@dpb.in'))
  })

  it('shows an approved book as Approved with date, and lets an approver withdraw', async () => {
    approvalsData = { biographies__jobs: { approved: true, by: 'e@dpb.in', at: '2026-08-04T09:00:00Z' } }
    setup()
    expect(screen.getByText(/Approved · 2026-08-04/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Withdraw approval for Think Different'))
    await waitFor(() => expect(unapproveSpy).toHaveBeenCalledWith('biographies__jobs'))
  })

  it('hides the approve controls from plain members', () => {
    setup({ email: 'member@thothica.com' })
    expect(screen.queryByLabelText('Approve Think Different')).not.toBeInTheDocument()
    // The derived state still shows — nothing is editable, everything is visible.
    expect(screen.getAllByText('Illustration underway').length).toBe(2)
  })

  it('filters to awaiting-approval only', () => {
    approvalsData = { biographies__jobs: { approved: true, by: 'e@dpb.in', at: '2026-08-04' } }
    setup()
    fireEvent.click(screen.getByLabelText(/Awaiting Diamond approval only/i))
    expect(screen.queryByText('Think Different')).not.toBeInTheDocument()
    expect(screen.getByText('The Little Master')).toBeInTheDocument()
  })

  it('searches by title', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Find a comic'), { target: { value: 'little master' } })
    expect(screen.queryByText('Think Different')).not.toBeInTheDocument()
    expect(screen.getByText('The Little Master')).toBeInTheDocument()
  })

  it('states the counting rule and the reset date in the footnote', () => {
    setup()
    expect(screen.getByText(/IFC and IBC are one page each/)).toBeInTheDocument()
    expect(screen.getByText(/reset on 2026-08-04/)).toBeInTheDocument()
  })
})

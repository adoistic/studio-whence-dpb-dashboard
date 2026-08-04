import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))

// Approvals store mocked; the pure derivation fns stay real via importOriginal.
const { approveSpy, withdrawSpy } = vi.hoisted(() => ({
  approveSpy: vi.fn<(id: string, stage: string, by: string) => Promise<void>>(() => Promise.resolve()),
  withdrawSpy: vi.fn<(id: string, stage: string, current: unknown, by: string) => Promise<void>>(
    () => Promise.resolve(),
  ),
}))
let approvalsData: Record<string, Record<string, { by: string; at: string }>> = {}

vi.mock('@/lib/approvals', async (orig) => ({
  ...(await orig<typeof import('@/lib/approvals')>()),
  useApprovals: () => ({ data: approvalsData, loading: false }),
  approveStage: approveSpy,
  withdrawStage: withdrawSpy,
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
  comic({
    slug: 'jobs',
    title: 'Think Different',
    program_slug: 'tech-legends',
    backCover: { image: { key: 'bc' } },
    insideCovers: { images: [{ key: 'inside-front-cover.png' }] },
    activities: { pages: [{ key: 'a' }, { key: 'b' }] },
  } as Partial<Comic>),
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
  withdrawSpy.mockClear()
  approvalsData = {}
})

describe('StatusTable', () => {
  it('gives every deliverable its own column', () => {
    setup()
    for (const col of [
      'Classification', 'Sub-classification', 'Comic', 'Total pages', 'Rate', 'Total value',
      'GST 18%', 'Total value with GST', 'TDS 2%', 'Net of TDS',
      'Script', 'Dossier', 'Illustration', 'Covers', 'IFC / IBC', 'Activity pages', 'Marketing',
    ]) {
      expect(screen.getByText(col)).toBeInTheDocument()
    }
  })

  it('shows an Approve button per stage — no single overall approve control', () => {
    setup()
    expect(screen.getByLabelText('Approve Illustration for Think Different')).toBeInTheDocument()
    expect(screen.getByLabelText('Approve Covers for Think Different')).toBeInTheDocument()
    expect(screen.getByLabelText('Approve IFC / IBC for Think Different')).toBeInTheDocument()
    expect(screen.getByLabelText('Approve Activity pages for Think Different')).toBeInTheDocument()
    // There is no book-level control.
    expect(screen.queryByLabelText('Approve Think Different')).not.toBeInTheDocument()
  })

  it('approves exactly the stage whose button was pressed', async () => {
    setup()
    fireEvent.click(screen.getByLabelText('Approve Illustration for Think Different'))
    await waitFor(() =>
      expect(approveSpy).toHaveBeenCalledWith('biographies__jobs', 'illustration', 'editor@dpb.in'),
    )
  })

  it('offers no button for a stage with nothing delivered', () => {
    setup()
    // The Little Master has no covers, no inside covers, no activities.
    expect(screen.queryByLabelText('Approve Covers for The Little Master')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Approve IFC / IBC for The Little Master')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Approve Activity pages for The Little Master')).not.toBeInTheDocument()
    // …but its script and illustration are real and approvable.
    expect(screen.getByLabelText('Approve Script for The Little Master')).toBeInTheDocument()
    expect(screen.getByLabelText('Approve Illustration for The Little Master')).toBeInTheDocument()
  })

  it('shows an approved stage as a dated tick, withdrawable on its own', async () => {
    approvalsData = { biographies__jobs: { covers: { by: 'e@dpb.in', at: '2026-08-04T09:00:00Z' } } }
    setup()
    expect(screen.getByText('✓ 2026-08-04')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Withdraw Covers approval for Think Different'))
    await waitFor(() => expect(withdrawSpy).toHaveBeenCalled())
    expect(withdrawSpy.mock.calls[0][1]).toBe('covers')
  })

  it('says WHICH inside cover exists, so a missing IBC is visible', () => {
    setup()
    expect(screen.getByText('IFC only')).toBeInTheDocument()
  })

  it('keeps activity pages separate from the inside covers', () => {
    setup()
    expect(screen.getByText('2 pages')).toBeInTheDocument()
  })

  it('hides every approve control from a plain member but still shows the state', () => {
    setup({ email: 'member@thothica.com' })
    expect(screen.queryByLabelText(/^Approve /)).not.toBeInTheDocument()
    expect(screen.getByText('IFC only')).toBeInTheDocument()
  })

  it('totals count stage approvals against delivered stages', () => {
    setup()
    expect(screen.getByText(/0 of \d+ delivered stages approved/)).toBeInTheDocument()
  })

  it('filters to rows with something still awaiting approval', () => {
    // Every delivered stage of The Little Master signed off → it drops out.
    approvalsData = {
      biographies__sachin: {
        script: { by: 'e@dpb.in', at: '2026-08-04' },
        illustration: { by: 'e@dpb.in', at: '2026-08-04' },
      },
    }
    setup()
    fireEvent.click(screen.getByLabelText(/Only rows with something awaiting approval/i))
    expect(screen.queryByText('The Little Master')).not.toBeInTheDocument()
    expect(screen.getByText('Think Different')).toBeInTheDocument()
  })

  it('states the counting rule, including IFC and IBC as separate pages', () => {
    setup()
    expect(screen.getByText(/separate pages, one each/)).toBeInTheDocument()
  })
})

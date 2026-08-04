import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))

// Approvals store mocked; the pure derivation fns stay real via importOriginal.
const { approveSpy, withdrawSpy, invoiceApproveSpy, invoiceGeneratedSpy, invoiceWithdrawSpy } = vi.hoisted(() => ({
  approveSpy: vi.fn<(id: string, stage: string, by: string) => Promise<void>>(() => Promise.resolve()),
  withdrawSpy: vi.fn<(id: string, stage: string, by: string) => Promise<void>>(() => Promise.resolve()),
  invoiceApproveSpy: vi.fn<(id: string, by: string) => Promise<void>>(() => Promise.resolve()),
  invoiceGeneratedSpy: vi.fn<(id: string, by: string) => Promise<void>>(() => Promise.resolve()),
  invoiceWithdrawSpy: vi.fn<(id: string, which: string, by: string) => Promise<void>>(() => Promise.resolve()),
}))
let stagesData: Record<string, Record<string, { by: string; at: string }>> = {}
let invoicesData: Record<string, { approved?: { by: string; at: string }; generated?: { by: string; at: string } }> = {}

vi.mock('@/lib/approvals', async (orig) => ({
  ...(await orig<typeof import('@/lib/approvals')>()),
  useApprovals: () => ({ data: { stages: stagesData, invoices: invoicesData }, loading: false }),
  approveStage: approveSpy,
  withdrawStage: withdrawSpy,
  approveForInvoice: invoiceApproveSpy,
  markInvoiceGenerated: invoiceGeneratedSpy,
  withdrawInvoiceMark: invoiceWithdrawSpy,
}))

import { StatusTable } from '@/components/StatusTable'
import { InvoiceTable } from '@/components/InvoiceTable'
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

function setupInvoices(over: Partial<Parameters<typeof InvoiceTable>[0]> = {}) {
  return render(
    <InvoiceTable
      comics={COMICS}
      figures={null}
      lines={LINES}
      programs={PROGRAMS}
      pricing={null}
      email="editor@dpb.in"
      canModerate={false}
      {...over}
    />,
  )
}

beforeEach(() => {
  approveSpy.mockClear()
  withdrawSpy.mockClear()
  invoiceApproveSpy.mockClear()
  invoiceGeneratedSpy.mockClear()
  invoiceWithdrawSpy.mockClear()
  stagesData = {}
  invoicesData = {}
})

describe('StatusTable', () => {
  it('tells the four stories in grouped columns', () => {
    setup()
    // Group headers…
    for (const g of ['Pages', 'Value (INR)', 'Sign-offs']) {
      expect(screen.getByText(g)).toBeInTheDocument()
    }
    // …and the column labels beneath them.
    for (const col of [
      'Classification', 'Sub-classification', 'Comic', 'Extras', 'Total', 'Generated', 'Rate',
      'Invoice value', 'With GST', 'Net after TDS',
      'Dossier', 'Illustration', 'Covers', 'IFC / IBC', 'Activity pages', 'Marketing', 'Status',
    ]) {
      expect(screen.getAllByText(col).length).toBeGreaterThan(0)
    }
    // "Script" is both a pages column and a stage column.
    expect(screen.getAllByText('Script').length).toBe(2)
  })

  it('shows the financial summary strip on the table itself — no tab switch needed', () => {
    setup()
    for (const label of [
      'Script pages', 'Generated pages', 'Invoice value', 'GST 18%', 'With GST', 'Net after TDS',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    // Two books at 48+8 = 112 total pages; ₹250 default rate → ₹28,000 base,
    // shown in the strip AND again in the table footer.
    expect(screen.getAllByText('₹28,000').length).toBeGreaterThanOrEqual(2)
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
    stagesData = { biographies__jobs: { covers: { by: 'e@dpb.in', at: '2026-08-04T09:00:00Z' } } }
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

  it('hides every approve control from a plain member but still shows the state', () => {
    setup({ email: 'member@thothica.com' })
    expect(screen.queryByLabelText(/^Approve /)).not.toBeInTheDocument()
    expect(screen.getByText('IFC only')).toBeInTheDocument()
  })

  it('a VIEWER at a @dpb.in address gets no controls either — stages or invoice', () => {
    // ankur@dpb.in: the domain would grant Diamond sign-off, the viewer role
    // takes it away. Read everything, act on nothing.
    setup({ email: 'ankur@dpb.in', viewer: true })
    expect(screen.queryByLabelText(/^Approve /)).not.toBeInTheDocument()
    expect(screen.queryByText('Approve for invoice')).not.toBeInTheDocument()
    // The data is all still there.
    expect(screen.getByText('Think Different')).toBeInTheDocument()
    expect(screen.getByText('IFC only')).toBeInTheDocument()
  })

  it('filters to rows with something still awaiting approval', () => {
    // Every delivered stage of The Little Master signed off → it drops out.
    stagesData = {
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

  it('states the counting rule: produced pages overwrite the plan', () => {
    setup()
    expect(screen.getByText(/produced count takes over/)).toBeInTheDocument()
  })

  // ── The invoice trail ──────────────────────────────────────────────────────

  it('lets an approver approve a book for invoice', async () => {
    setup()
    fireEvent.click(screen.getByLabelText('Approve Think Different for invoice'))
    await waitFor(() =>
      expect(invoiceApproveSpy).toHaveBeenCalledWith('biographies__jobs', 'editor@dpb.in'),
    )
  })

  it('shows the invoice approval as a dated mark, withdrawable', async () => {
    invoicesData = { biographies__jobs: { approved: { by: 'e@dpb.in', at: '2026-08-04T10:00:00Z' } } }
    setup()
    expect(screen.getByText('✓ For invoice 2026-08-04')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Withdraw invoice approval for Think Different'))
    await waitFor(() =>
      expect(invoiceWithdrawSpy).toHaveBeenCalledWith('biographies__jobs', 'approved', 'editor@dpb.in'),
    )
  })

  it('shows a generated invoice as final — no withdraw here', () => {
    invoicesData = {
      biographies__jobs: {
        approved: { by: 'e', at: '2026-08-04T10:00:00Z' },
        generated: { by: 'e', at: '2026-08-05T10:00:00Z' },
      },
    }
    setup()
    expect(screen.getByText('Invoiced 2026-08-05')).toBeInTheDocument()
    expect(screen.queryByLabelText('Withdraw invoice approval for Think Different')).not.toBeInTheDocument()
  })
})

describe('InvoiceTable — the Approved-for-invoice tab', () => {
  it('shows ONLY invoice-approved books', () => {
    invoicesData = { biographies__jobs: { approved: { by: 'e', at: '2026-08-04T10:00:00Z' } } }
    setupInvoices()
    expect(screen.getByText('Think Different')).toBeInTheDocument()
    expect(screen.queryByText('The Little Master')).not.toBeInTheDocument()
  })

  it('marks an awaiting book as invoice generated', async () => {
    invoicesData = { biographies__jobs: { approved: { by: 'e', at: '2026-08-04T10:00:00Z' } } }
    setupInvoices()
    fireEvent.click(screen.getByLabelText('Mark invoice generated for Think Different'))
    await waitFor(() =>
      expect(invoiceGeneratedSpy).toHaveBeenCalledWith('biographies__jobs', 'editor@dpb.in'),
    )
  })

  it('splits generated invoices into their own section, with an undo', async () => {
    invoicesData = {
      biographies__jobs: {
        approved: { by: 'e', at: '2026-08-04T10:00:00Z' },
        generated: { by: 'e', at: '2026-08-05T10:00:00Z' },
      },
    }
    setupInvoices()
    expect(screen.getByText('Invoiced 2026-08-05')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Undo invoice generated for Think Different'))
    await waitFor(() =>
      expect(invoiceWithdrawSpy).toHaveBeenCalledWith('biographies__jobs', 'generated', 'editor@dpb.in'),
    )
  })

  it('is honest when nothing is approved yet', () => {
    setupInvoices()
    expect(screen.getByText(/Nothing is approved for invoice yet/)).toBeInTheDocument()
  })

  it('a VIEWER sees the queue but cannot mark invoices generated', () => {
    invoicesData = { biographies__jobs: { approved: { by: 'e', at: '2026-08-04T10:00:00Z' } } }
    setupInvoices({ email: 'ankur@dpb.in', viewer: true })
    expect(screen.getByText('Think Different')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Mark invoice generated/)).not.toBeInTheDocument()
    expect(screen.getByText('Awaiting invoice')).toBeInTheDocument()
  })
})

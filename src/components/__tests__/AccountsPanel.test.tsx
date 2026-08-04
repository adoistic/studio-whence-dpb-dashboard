import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))

let stagesData: Record<string, Record<string, { by: string; at: string }>> = {}
let invoicesData: Record<string, { approved?: { by: string; at: string }; generated?: { by: string; at: string } }> = {}

vi.mock('@/lib/approvals', async (orig) => ({
  ...(await orig<typeof import('@/lib/approvals')>()),
  useApprovals: () => ({ data: { stages: stagesData, invoices: invoicesData }, loading: false }),
}))

const { saveSpy } = vi.hoisted(() => ({
  saveSpy: vi.fn<(items: unknown[], by: string) => Promise<void>>(() => Promise.resolve()),
}))
let advancesData: import('@/lib/advances').Advance[] = []

vi.mock('@/lib/advances', async (orig) => ({
  ...(await orig<typeof import('@/lib/advances')>()),
  useAdvances: () => ({ data: advancesData, loading: false }),
  saveAdvances: saveSpy,
}))

import { AccountsPanel } from '@/components/AccountsPanel'
import type { Advance } from '@/lib/advances'
import type { Comic, Line, Program } from '@/types/content'

const ADVANCES: Advance[] = [
  { id: 'a1', date: '2026-05-13', company: 'Diamond Magazines Private Limited', amount: 33_494, tdsDeducted: true },
  { id: 'a2', date: '2026-06-05', company: 'Diamond Magazines Private Limited', amount: 34_800, tdsDeducted: true },
  { id: 'a3', date: '2026-06-06', company: 'Trijal TradeCop Pvt Ltd', amount: 50_000, tdsDeducted: false },
  { id: 'a4', date: '2026-06-16', company: 'Diamond Magazines Private Limited', amount: 50_000, tdsDeducted: false },
  { id: 'a5', date: '2026-06-23', company: 'Diamond Magazines Private Limited', amount: 50_000, tdsDeducted: false },
]

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

const COMICS = [
  comic({ slug: 'jobs', title: 'Think Different' }),
  comic({ slug: 'sachin', title: 'The Little Master' }),
]

function setup(over: Partial<Parameters<typeof AccountsPanel>[0]> = {}) {
  return render(
    <AccountsPanel
      comics={COMICS}
      figures={null}
      lines={LINES}
      programs={[] as Program[]}
      pricing={null}
      email="a@thothica.com"
      canAdmin
      {...over}
    />,
  )
}

beforeEach(() => {
  saveSpy.mockClear()
  stagesData = {}
  invoicesData = {}
  advancesData = ADVANCES
})

describe('AccountsPanel', () => {
  it('totals the advances: ₹2,18,294 received across five receipts', () => {
    setup()
    // Appears twice: the Advances tile, and (with no invoices yet) the
    // advance-left-to-adjust tile equals the whole amount.
    expect(screen.getAllByText('₹2,18,294').length).toBeGreaterThanOrEqual(1)
    // Tile sub AND the ledger's totals row both state the receipt count.
    expect(screen.getAllByText(/5 receipts · 2 companies/).length).toBe(2)
    // Each receipt is a row, with the payer named as dictated.
    expect(screen.getByText('Trijal TradeCop Pvt Ltd')).toBeInTheDocument()
    expect(screen.getAllByText('Diamond Magazines Private Limited').length).toBe(4)
  })

  it('grosses up only the receipts where TDS was deducted', () => {
    setup()
    // ₹33,494 net of 2% → ₹684 TDS shown (rounded to the rupee on screen).
    expect(screen.getByText('₹684')).toBeInTheDocument()
    expect(screen.getByText('₹710')).toBeInTheDocument()
    // The three clean receipts say so plainly.
    expect(screen.getAllByText('None').length).toBe(3)
  })

  it('splits invoiced books from work in progress', () => {
    invoicesData = {
      biographies__jobs: {
        approved: { by: 'e', at: '2026-08-01T00:00:00Z' },
        generated: { by: 'e', at: '2026-08-02T00:00:00Z' },
      },
    }
    setup()
    // Think Different is in the invoices section…
    expect(screen.getByText('Think Different')).toBeInTheDocument()
    expect(screen.getByText('2026-08-02')).toBeInTheDocument()
    // …and WIP counts only the other book: 1 book, 56 billed pages.
    expect(screen.getByText(/books not yet invoiced · 56 billable pages/)).toBeInTheDocument()
    expect(screen.getByText('Total work in progress')).toBeInTheDocument()
  })

  it('reconciles advances against invoices: advance left to adjust', () => {
    invoicesData = {
      biographies__jobs: {
        approved: { by: 'e', at: '2026-08-01T00:00:00Z' },
        generated: { by: 'e', at: '2026-08-02T00:00:00Z' },
      },
    }
    setup()
    // ₹2,18,294 received − ₹16,240 invoiced net = ₹2,02,054 still to adjust.
    expect(screen.getByText('Advance left to adjust')).toBeInTheDocument()
    expect(screen.getByText('₹2,02,054')).toBeInTheDocument()
  })

  it('records a new receipt through the admin form', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Date received'), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText('Paying company'), { target: { value: 'Diamond Magazines Private Limited' } })
    fireEvent.change(screen.getByLabelText('Amount received in rupees'), { target: { value: '25000' } })
    fireEvent.click(screen.getByText('Add receipt'))
    await waitFor(() => expect(saveSpy).toHaveBeenCalled())
    const [items, by] = saveSpy.mock.calls[0]
    expect(items).toHaveLength(6)
    expect(by).toBe('a@thothica.com')
    const added = (items as Advance[]).find((a) => a.date === '2026-07-01')!
    expect(added.amount).toBe(25_000)
    expect(added.tdsDeducted).toBe(false)
  })

  it('removes a mis-entered receipt', async () => {
    setup()
    fireEvent.click(screen.getByLabelText('Remove advance of ₹50,000 from Trijal TradeCop Pvt Ltd on 2026-06-06'))
    await waitFor(() => expect(saveSpy).toHaveBeenCalled())
    const [items] = saveSpy.mock.calls[0]
    expect((items as Advance[]).map((a) => a.id)).toEqual(['a1', 'a2', 'a4', 'a5'])
  })

  it('hides the ledger controls from non-admins but still shows the money', () => {
    setup({ canAdmin: false })
    expect(screen.queryByText('Add receipt')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Remove advance/)).not.toBeInTheDocument()
    expect(screen.getAllByText('₹2,18,294').length).toBeGreaterThanOrEqual(1)
  })

  it('is honest when the ledger is empty', () => {
    advancesData = []
    setup()
    expect(screen.getByText('No advances recorded yet.')).toBeInTheDocument()
  })
})

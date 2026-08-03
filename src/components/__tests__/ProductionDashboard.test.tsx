import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))

import { ProductionDashboard } from '@/components/ProductionDashboard'
import type { Comic, Line, Program } from '@/types/content'
import type { PricingConfig } from '@/lib/pricing'

function comic(over: Partial<Comic> = {}): Comic {
  return {
    title: 'A Book',
    line: 'biographies',
    slug: 'a-book',
    subject_slug: 'someone',
    status: 'draft',
    target_length_pages: 48,
    pages: { hasPages: true, count: 24, coverKey: null },
    ...over,
  } as Comic
}

const LINES = [
  { slug: 'biographies', title: 'Biographies', subtitle: '', comics: [], figures: [] },
  { slug: 'indic', title: 'Indic', subtitle: '', comics: [], figures: [] },
] as unknown as Line[]

const PROGRAMS = [
  { slug: 'tech-legends', line: 'biographies', title: 'Tech Legends' },
  { slug: 'cricket-legends', line: 'biographies', title: 'Cricket Legends' },
] as Program[]

const PRICING: PricingConfig = {
  currency: 'INR',
  defaultRatePerPage: 250,
  lines: { indic: 400 },
  comics: { 'biographies__jobs': 1000 },
}

const COMICS = [
  comic({ slug: 'jobs', title: 'Think Different', program_slug: 'tech-legends', status: 'approved' }),
  comic({ slug: 'sachin', title: 'The Little Master', program_slug: 'cricket-legends' }),
  comic({ slug: 'shiva', title: 'Shiva', line: 'indic', program_slug: null, status: 'published' }),
]

function setup(over: Partial<Parameters<typeof ProductionDashboard>[0]> = {}) {
  return render(
    <ProductionDashboard
      comics={COMICS}
      lines={LINES}
      programs={PROGRAMS}
      pricing={PRICING}
      canAdmin
      {...over}
    />,
  )
}

describe('ProductionDashboard', () => {
  it('shows a studio headline that matches the data', () => {
    setup()
    const tile = screen.getByText('Comics in production').closest('div')!.parentElement!.parentElement!
    expect(within(tile).getByText('3')).toBeInTheDocument()
    // 24 pages × 3 books, shown on the pages tile
    expect(screen.getByText(/^72$/)).toBeInTheDocument()
    expect(screen.getByText(/of 144 targeted/)).toBeInTheDocument()
  })

  it('lists every line as a section heading', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Biographies' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Indic' })).toBeInTheDocument()
  })

  it('drills line → program → comic', () => {
    setup()
    // Programs are hidden until the line is opened.
    expect(screen.queryByText('Tech Legends')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('heading', { name: 'Biographies' }))
    expect(screen.getByText('Tech Legends')).toBeInTheDocument()
    // Comics are hidden until the program is opened.
    expect(screen.queryByText('Think Different')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Tech Legends'))
    expect(screen.getByText('Think Different')).toBeInTheDocument()
  })

  it('skips the program tier when a line has only one, so a book is one click away', () => {
    setup()
    fireEvent.click(screen.getByRole('heading', { name: 'Indic' }))
    // No program row to open — the comic is immediately visible.
    expect(screen.getByText('Shiva')).toBeInTheDocument()
  })

  it('marks an overridden rate so nobody has to guess why it differs', () => {
    setup()
    fireEvent.click(screen.getByRole('heading', { name: 'Biographies' }))
    fireEvent.click(screen.getByText('Tech Legends'))
    expect(screen.getByText('override')).toBeInTheDocument()
    expect(screen.getByText('₹1,000')).toBeInTheDocument()
  })

  it('filters to one line', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Indic' }))
    expect(screen.queryByRole('heading', { name: 'Biographies' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Indic' })).toBeInTheDocument()
  })

  it('filters by status', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Published' }))
    // Only the Indic book is published.
    expect(screen.queryByRole('heading', { name: 'Biographies' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Indic' })).toBeInTheDocument()
  })

  it('searches by title', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Find a comic'), { target: { value: 'little master' } })
    expect(screen.getByRole('heading', { name: 'Biographies' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Indic' })).not.toBeInTheDocument()
  })

  it('says so plainly when a filter matches nothing', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Find a comic'), { target: { value: 'zzzz' } })
    expect(screen.getByText('No comics match this view.')).toBeInTheDocument()
  })

  it('hides the rate-setting shortcut from non-admins', () => {
    const { rerender } = setup()
    expect(screen.getByText('Set rates')).toBeInTheDocument()
    rerender(
      <ProductionDashboard comics={COMICS} lines={LINES} programs={PROGRAMS} pricing={PRICING} canAdmin={false} />,
    )
    expect(screen.queryByText('Set rates')).not.toBeInTheDocument()
  })

  it('renders with no comics at all', () => {
    setup({ comics: [] })
    expect(screen.getByText('No comics match this view.')).toBeInTheDocument()
  })

  it('states what the trend can and cannot show', () => {
    setup({
      comics: [
        comic({ slug: 'a', created: '2026-01-01' }),
        comic({ slug: 'b', created: '2026-02-01' }),
        comic({ slug: 'c', created: '2026-03-01' }),
      ],
    })
    expect(screen.getByText(/authoring activity, not pages drawn/)).toBeInTheDocument()
  })

  it('explains delivered vs contracted in the footnote', () => {
    setup()
    const note = screen.getByText(/pages actually drawn/)
    expect(within(note).getByText('Delivered')).toBeInTheDocument()
    expect(within(note).getByText('Contracted')).toBeInTheDocument()
  })
})

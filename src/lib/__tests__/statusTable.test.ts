import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: () => ({}), getDoc: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(),
  collection: () => ({}),
}))

import { buildStatusTable, statusTableCsvRows, statusTableTotals } from '@/lib/statusTable'
import { canApprove, deliveryOf } from '@/lib/approvals'
import type { Comic, Figure, Line, Program } from '@/types/content'
import type { PricingConfig } from '@/lib/pricing'

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
  { slug: 'awareness', title: 'Awareness', subtitle: '', comics: [], figures: [] },
] as unknown as Line[]

const PROGRAMS = [
  { slug: 'business-legends', line: 'biographies', title: 'Business Legends' },
  { slug: 'tech-legends', line: 'biographies', title: 'Tech Legends' },
] as Program[]

const FIGURES = [
  { slug: 'someone', series: 'x', sources_count: 3, words: 250_000 },
  { slug: 'stub', series: 'x', sources_count: 0, words: 100 },
] as Figure[]

const PRICING: PricingConfig = { currency: 'INR', defaultRatePerPage: 250, lines: {}, comics: {} }

describe('deliveryOf (the auto ladder nobody can hand-edit)', () => {
  it('a catalog comic with no art is Script received — there is no "not received" rung', () => {
    expect(deliveryOf(comic({ pages: undefined })).state).toBe('script')
  })
  it('art in progress is Illustration underway', () => {
    expect(deliveryOf(comic()).state).toBe('illustration')
  })
  it('interior at target is Interior complete', () => {
    expect(deliveryOf(comic({ pages: { hasPages: true, count: 48, coverKey: null } })).state).toBe('interior-done')
  })
  it('interior + cover + back + IFC/IBC + activities is Complete set', () => {
    const c = comic({
      pages: { hasPages: true, count: 48, coverKey: 'c.jpg' },
      backCover: { image: { key: 'b' } },
      insideCovers: { images: [{ key: 'i' }] },
      activities: { pages: [{ key: 'a' }] },
    } as Partial<Comic>)
    expect(deliveryOf(c).state).toBe('complete-set')
  })
})

describe('canApprove', () => {
  it('Diamond (@dpb.in) and moderators may act; members may not', () => {
    expect(canApprove('editor@dpb.in', false)).toBe(true)
    expect(canApprove('adnan@thothica.com', true)).toBe(true)
    expect(canApprove('member@thothica.com', false)).toBe(false)
    expect(canApprove(null, false)).toBe(false)
  })
})

describe('buildStatusTable', () => {
  const comics = [
    comic({ slug: 'b2', title: 'Zeta', program_slug: 'tech-legends' }),
    comic({ slug: 'b1', title: 'Alpha', program_slug: 'business-legends' }),
    comic({ line: 'awareness', slug: 'aw', title: 'Aware', program_slug: null, subject_slug: null }),
  ]

  it('classifies by line title and sub-classifies by series/program title', () => {
    const rows = buildStatusTable(comics, FIGURES, LINES, PROGRAMS, PRICING, {})
    expect(rows.map((r) => [r.classification, r.subClassification, r.title])).toEqual([
      ['Awareness', '—', 'Aware'],
      ['Biographies', 'Business Legends', 'Alpha'],
      ['Biographies', 'Tech Legends', 'Zeta'],
    ])
  })

  it('total pages = interior + cover + IFC/IBC + back + activities', () => {
    const rows = buildStatusTable(
      [comic({
        coverOptions: { options: [{ key: 'a' }, { key: 'b' }, { key: 'c' }] },
        backCover: { image: { key: 'bc' } },
        insideCovers: { images: [{ key: 'ifc' }, { key: 'ibc' }] },
        activities: { pages: [{ key: '1' }, { key: '2' }, { key: '3' }, { key: '4' }] },
      } as Partial<Comic>)],
      null, LINES, PROGRAMS, PRICING, {},
    )
    expect(rows[0].totalPages).toBe(24 + 8)
    expect(rows[0].totalValue).toBe(32 * 250)
  })

  it('reads the script date from the script front-matter', () => {
    const rows = buildStatusTable([comic({ created: '2026-03-15T10:00:00' })], null, LINES, null, PRICING, {})
    expect(rows[0].scriptDate).toBe('2026-03-15')
  })

  it('reports the dossier state from the figure research, honestly banded', () => {
    const rows = buildStatusTable(
      [comic(), comic({ slug: 's', subject_slug: 'stub' }), comic({ slug: 'n', subject_slug: null })],
      FIGURES, LINES, null, PRICING, {},
    )
    const bySlug = new Map(rows.map((r) => [r.key, r]))
    expect(bySlug.get('biographies__a-book')!.dossier.state).toBe('ready')
    expect(bySlug.get('biographies__s')!.dossier.state).toBe('none')
    expect(bySlug.get('biographies__n')!.dossier.state).toBe('n/a')
  })

  it('flags the complete set only when all four component groups exist', () => {
    const complete = comic({
      pages: { hasPages: true, count: 48, coverKey: 'c.jpg' },
      backCover: { image: { key: 'b' } },
      insideCovers: { images: [{ key: 'i' }] },
      activities: { pages: [{ key: 'a' }] },
    } as Partial<Comic>)
    const rows = buildStatusTable([complete, comic({ slug: 'bare' })], null, LINES, null, PRICING, {})
    expect(rows.find((r) => r.key === 'biographies__a-book')!.set.complete).toBe(true)
    expect(rows.find((r) => r.key === 'biographies__bare')!.set.complete).toBe(false)
  })

  it('counts marketing material: Amazon modules + about-the-book', () => {
    const rows = buildStatusTable(
      [comic({
        amazonModules: { groups: [{ images: [{ key: '1' }, { key: '2' }] }] } as unknown,
        aboutTheBook: { language: 'en', backCover: [], segments: [] },
      } as Partial<Comic>)],
      null, LINES, null, PRICING, {},
    )
    expect(rows[0].marketing).toMatchObject({ amazon: 2, about: true })
  })

  it('attaches the approval when the ledger has one', () => {
    const rows = buildStatusTable(comics, null, LINES, PROGRAMS, PRICING, {
      biographies__b1: { approved: true, by: 'x@dpb.in', at: '2026-08-04T00:00:00Z' },
    })
    expect(rows.find((r) => r.key === 'biographies__b1')!.approval?.by).toBe('x@dpb.in')
    expect(rows.find((r) => r.key === 'biographies__b2')!.approval).toBeNull()
  })

  it('an empty approvals map (the reset) leaves every row unapproved', () => {
    const rows = buildStatusTable(comics, null, LINES, PROGRAMS, PRICING, {})
    expect(rows.every((r) => r.approval === null)).toBe(true)
  })
})

describe('totals + CSV', () => {
  const comics = [comic(), comic({ slug: 'b', backCover: { image: { key: 'x' } } } as Partial<Comic>)]

  it('totals sum what the rows show', () => {
    const rows = buildStatusTable(comics, null, LINES, null, PRICING, {
      biographies__b: { approved: true, by: 'x', at: '2026-08-04' },
    })
    const t = statusTableTotals(rows)
    expect(t.comics).toBe(2)
    expect(t.interior).toBe(48)
    expect(t.extras).toBe(1)
    expect(t.totalPages).toBe(49)
    expect(t.totalValue).toBe(49 * 250)
    expect(t.approved).toBe(1)
  })

  it('the CSV is the screen, column for column', () => {
    const rows = buildStatusTable(comics, null, LINES, null, PRICING, {})
    const csv = statusTableCsvRows(rows)
    expect(csv[0]['Classification']).toBe('Biographies')
    expect(csv[0]['Total pages']).toBe(24)
    expect(csv[0]['Rate per page (INR)']).toBe(250)
    expect(csv[0]['Diamond approved']).toBe('No')
    expect(csv[0]['Script date']).toBe('2026-05-01')
  })
})

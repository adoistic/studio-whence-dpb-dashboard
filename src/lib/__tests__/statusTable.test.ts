import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: () => ({}), getDoc: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(),
  collection: () => ({}),
}))

import { buildStatusTable, statusTableCsvRows, statusTableTotals } from '@/lib/statusTable'
import { canApprove, stageReady, STAGES } from '@/lib/approvals'
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

describe('stageReady — you cannot approve an empty cell', () => {
  it('script is always ready: a comic is in the catalog only because its script is in', () => {
    expect(stageReady('script', comic({ pages: undefined }))).toBe(true)
  })
  it('illustration needs art', () => {
    expect(stageReady('illustration', comic({ pages: undefined }))).toBe(false)
    expect(stageReady('illustration', comic())).toBe(true)
  })
  it('covers need a front or a back', () => {
    expect(stageReady('covers', comic())).toBe(false)
    expect(stageReady('covers', comic({ backCover: { image: { key: 'b' } } } as Partial<Comic>))).toBe(true)
  })
  it('inside covers are ready when EITHER the IFC or the IBC exists', () => {
    expect(stageReady('insideCovers', comic())).toBe(false)
    expect(
      stageReady('insideCovers', comic({ insideCovers: { images: [{ key: 'inside-front-cover.png' }] } } as Partial<Comic>)),
    ).toBe(true)
  })
  it('activities need activity pages', () => {
    expect(stageReady('activities', comic())).toBe(false)
    expect(stageReady('activities', comic({ activities: { pages: [{ key: 'a' }] } } as Partial<Comic>))).toBe(true)
  })
  it('dossier needs real research on the figure', () => {
    expect(stageReady('dossier', comic(), FIGURES[0])).toBe(true)
    expect(stageReady('dossier', comic(), FIGURES[1])).toBe(false)
    expect(stageReady('dossier', comic(), null)).toBe(false)
  })
  it('marketing needs Amazon modules or an about-the-book', () => {
    expect(stageReady('marketing', comic())).toBe(false)
    expect(
      stageReady('marketing', comic({ aboutTheBook: { language: 'en', backCover: [], segments: [] } } as Partial<Comic>)),
    ).toBe(true)
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

  it('total pages counts IFC and IBC separately', () => {
    const rows = buildStatusTable(
      [comic({
        coverOptions: { options: [{ key: 'a' }, { key: 'b' }, { key: 'c' }] },
        backCover: { image: { key: 'bc' } },
        insideCovers: { images: [{ key: 'inside-front-cover.png' }, { key: 'inside-back-cover.png' }] },
        activities: { pages: [{ key: '1' }, { key: '2' }, { key: '3' }, { key: '4' }] },
      } as Partial<Comic>)],
      null, LINES, PROGRAMS, PRICING, {},
    )
    expect(rows[0].totalPages).toBe(24 + 8)
    expect(rows[0].totalValue).toBe(32 * 250)
  })

  it('the IFC/IBC cell says WHICH one exists — the reason they were split', () => {
    const only = buildStatusTable(
      [comic({ insideCovers: { images: [{ key: 'inside-front-cover.png' }] } } as Partial<Comic>)],
      null, LINES, null, PRICING, {},
    )
    expect(only[0].stages.insideCovers.detail).toBe('IFC only')

    const both = buildStatusTable(
      [comic({ insideCovers: { images: [{ key: 'inside-front-cover.png' }, { key: 'inside-back-cover.png' }] } } as Partial<Comic>)],
      null, LINES, null, PRICING, {},
    )
    expect(both[0].stages.insideCovers.detail).toBe('IFC + IBC')

    const none = buildStatusTable([comic()], null, LINES, null, PRICING, {})
    expect(none[0].stages.insideCovers.detail).toBe('None yet')
  })

  it('activity pages are their own stage, independent of the inside covers', () => {
    const rows = buildStatusTable(
      [comic({ activities: { pages: [{ key: 'a' }, { key: 'b' }] } } as Partial<Comic>)],
      null, LINES, null, PRICING, {},
    )
    expect(rows[0].stages.activities.detail).toBe('2 pages')
    expect(rows[0].stages.activities.ready).toBe(true)
    // …while the inside covers stay unmade and unapprovable.
    expect(rows[0].stages.insideCovers.ready).toBe(false)
  })

  it('gives every stage a cell so each gets its own column and button', () => {
    const rows = buildStatusTable([comic()], FIGURES, LINES, null, PRICING, {})
    expect(Object.keys(rows[0].stages).sort()).toEqual([...STAGES].sort())
  })

  it('attaches a per-stage approval and counts only delivered stages as approvable', () => {
    const rows = buildStatusTable([comic()], FIGURES, LINES, null, PRICING, {
      'biographies__a-book': { illustration: { by: 'x@dpb.in', at: '2026-08-04T00:00:00Z' } },
    })
    expect(rows[0].stages.illustration.approval?.by).toBe('x@dpb.in')
    expect(rows[0].stages.covers.approval).toBeNull()
    expect(rows[0].approvedCount).toBe(1)
    // script + dossier + illustration are deliverable; covers/inside/activities/marketing are not
    expect(rows[0].readyCount).toBe(3)
  })

  it('an empty ledger (the reset) leaves every stage unapproved', () => {
    const rows = buildStatusTable(comics, FIGURES, LINES, PROGRAMS, PRICING, {})
    expect(rows.every((r) => r.approvedCount === 0)).toBe(true)
  })

  it('reads the script date from the script front-matter', () => {
    const rows = buildStatusTable([comic({ created: '2026-03-15T10:00:00' })], null, LINES, null, PRICING, {})
    expect(rows[0].scriptDate).toBe('2026-03-15')
    expect(rows[0].stages.script.detail).toBe('2026-03-15')
  })

  it('reports the dossier from the figure research, honestly', () => {
    const rows = buildStatusTable(
      [comic(), comic({ slug: 's', subject_slug: 'stub' }), comic({ slug: 'n', subject_slug: null })],
      FIGURES, LINES, null, PRICING, {},
    )
    const by = new Map(rows.map((r) => [r.key, r]))
    expect(by.get('biographies__a-book')!.stages.dossier.detail).toBe('250k words')
    expect(by.get('biographies__s')!.stages.dossier.detail).toBe('Not started')
    expect(by.get('biographies__n')!.stages.dossier.detail).toBe('Not subject-based')
  })
})

describe('totals + CSV', () => {
  const comics = [
    comic(),
    comic({
      slug: 'b',
      backCover: { image: { key: 'x' } },
      insideCovers: { images: [{ key: 'inside-front-cover.png' }] },
    } as Partial<Comic>),
  ]

  it('totals sum what the rows show, with IFC/IBC and activities counted apart', () => {
    const rows = buildStatusTable(comics, FIGURES, LINES, null, PRICING, {
      biographies__b: { covers: { by: 'x', at: '2026-08-04' } },
    })
    const t = statusTableTotals(rows)
    expect(t.comics).toBe(2)
    expect(t.interior).toBe(48)
    expect(t.covers).toBe(1)
    expect(t.insideCovers).toBe(1)
    expect(t.activities).toBe(0)
    expect(t.totalPages).toBe(50)
    expect(t.totalValue).toBe(50 * 250)
    expect(t.approvedStages).toBe(1)
  })

  it('the CSV carries IFC and IBC as separate columns and one approval per stage', () => {
    const rows = buildStatusTable(comics, FIGURES, LINES, null, PRICING, {
      'biographies__a-book': { script: { by: 'e@dpb.in', at: '2026-08-04T00:00:00Z' } },
    })
    const csv = statusTableCsvRows(rows)
    expect(csv[0]['IFC']).toBe(0)
    expect(csv[0]['IBC']).toBe(0)
    expect(csv[0]['Script approval']).toBe('Approved 2026-08-04')
    expect(csv[0]['Covers approval']).toBe('Not delivered')
    expect(csv[1]['IFC']).toBe(1)
    expect(csv[1]['IBC']).toBe(0)
    expect(csv[1]['Covers approval']).toBe('Awaiting approval')
  })
})

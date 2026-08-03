import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Firestore mock ────────────────────────────────────────────────────────────
// pricing.ts imports firebase.ts, which initializes real Auth at module load and
// throws without an API key. Same shape as allocation.test.ts: doc() tags the
// path so a write can be asserted against it, and getDoc is driven per test.

const mockSetDoc = vi.fn()
const mockGetDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ __path: `${col}/${id}` }),
  getDoc: (...a: unknown[]) => mockGetDoc(...a),
  setDoc: (...a: unknown[]) => mockSetDoc(...a),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))

import {
  DEFAULT_RATE_PER_PAGE,
  EMPTY_PRICING,
  comicKey,
  formatMoney,
  formatMoneyShort,
  lineRate,
  rateFor,
  valueOf,
  clearComicRate,
  setComicRate,
  setLineRate,
  seedLineRates,
  type PricingConfig,
} from '@/lib/pricing'
import { buildModel, buildTrend, tallyOf, exportRows } from '@/lib/productionModel'
import type { Comic } from '@/types/content'

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

const CFG: PricingConfig = {
  currency: 'INR',
  defaultRatePerPage: 250,
  lines: { indic: 400 },
  comics: { 'biographies__special': 1000 },
}

describe('rate resolution', () => {
  it('falls back to the studio default', () => {
    expect(rateFor(comic(), CFG)).toEqual({ rate: 250, source: 'default', overridden: false })
  })

  it('prefers the line rate over the default', () => {
    expect(rateFor(comic({ line: 'indic' }), CFG).rate).toBe(400)
    expect(rateFor(comic({ line: 'indic' }), CFG).source).toBe('line')
  })

  it('prefers a per-comic override over the line rate', () => {
    const r = rateFor(comic({ slug: 'special' }), CFG)
    expect(r).toEqual({ rate: 1000, source: 'comic', overridden: true })
  })

  it('treats a stored zero as a real rate, not as absent', () => {
    // The bug this guards: `rate || default` promotes a deliberate ₹0 back to ₹250.
    const cfg: PricingConfig = { ...CFG, comics: { 'biographies__free': 0 } }
    expect(rateFor(comic({ slug: 'free' }), cfg)).toEqual({ rate: 0, source: 'comic', overridden: true })
  })

  it('works with no config at all', () => {
    expect(rateFor(comic(), null).rate).toBe(DEFAULT_RATE_PER_PAGE)
    expect(rateFor(comic(), EMPTY_PRICING).rate).toBe(DEFAULT_RATE_PER_PAGE)
  })

  it('resolves a line rate independently of any comic', () => {
    expect(lineRate('indic', CFG)).toEqual({ rate: 400, source: 'line', overridden: true })
    expect(lineRate('toddlers', CFG)).toEqual({ rate: 250, source: 'default', overridden: false })
  })

  it('keys comics by line and slug', () => {
    expect(comicKey('indic', 'shiva')).toBe('indic__shiva')
  })
})

describe('value', () => {
  it('separates delivered from contracted', () => {
    const v = valueOf(comic(), CFG)
    expect(v.delivered).toBe(24 * 250)
    expect(v.contracted).toBe(48 * 250)
  })

  it('a book with no art delivers nothing but is still contracted', () => {
    const v = valueOf(comic({ pages: undefined }), CFG)
    expect(v.delivered).toBe(0)
    expect(v.contracted).toBe(12_000)
  })
})

describe('money formatting', () => {
  it('groups in the Indian system', () => {
    expect(formatMoney(1234567)).toBe('₹12,34,567')
  })
  it('shortens to lakh and crore', () => {
    expect(formatMoneyShort(1_200_000)).toBe('₹12 L')
    expect(formatMoneyShort(15_000_000)).toBe('₹1.5 Cr')
    expect(formatMoneyShort(12_000)).toBe('₹12,000')
  })
})

describe('tally', () => {
  const comics = [
    comic({ slug: 'a', status: 'draft' }),
    comic({ slug: 'b', status: 'published', pages: { hasPages: true, count: 48, coverKey: null } }),
    comic({ slug: 'special', status: 'approved' }),
  ]

  it('sums pages, value and statuses', () => {
    const t = tallyOf('x', 'X', comics, CFG)
    expect(t.comics).toBe(3)
    expect(t.pagesMade).toBe(24 + 48 + 24)
    expect(t.pagesTarget).toBe(144)
    expect(t.byStatus.draft).toBe(1)
    expect(t.byStatus.published).toBe(1)
    expect(t.byStatus.approved).toBe(1)
    // two at ₹250 (24 + 48 pages) plus the ₹1000 override on 24 pages
    expect(t.delivered).toBe(72 * 250 + 24 * 1000)
  })

  it('reports the distinct rates inside it, so a mixed tier is visible', () => {
    expect(tallyOf('x', 'X', comics, CFG).rates).toEqual([250, 1000])
  })

  it('counts a fully drawn book as complete', () => {
    expect(tallyOf('x', 'X', comics, CFG).complete).toBe(1)
  })

  it('leaves progress null rather than dividing by zero', () => {
    expect(tallyOf('x', 'X', [comic({ target_length_pages: 0 })], CFG).progress).toBeNull()
  })
})

describe('buildModel', () => {
  const comics = [
    comic({ line: 'biographies', slug: 'a', program_slug: 'tech-legends' }),
    comic({ line: 'biographies', slug: 'b', program_slug: 'cricket-legends' }),
    comic({ line: 'indic', slug: 'c', program_slug: null }),
  ]

  it('headline equals the sum of the lines', () => {
    const m = buildModel(comics, null, null, CFG)
    expect(m.studio.comics).toBe(3)
    expect(m.studio.delivered).toBe(m.lines.reduce((n, l) => n + l.tally.delivered, 0))
    expect(m.studio.pagesMade).toBe(m.lines.reduce((n, l) => n + l.tally.pagesMade, 0))
  })

  it('a line equals the sum of its programs', () => {
    const m = buildModel(comics, null, null, CFG)
    const bios = m.lines.find((l) => l.tally.key === 'biographies')!
    expect(bios.programs.reduce((n, p) => n + p.tally.comics, 0)).toBe(bios.tally.comics)
  })

  it('keeps a comic whose line has no catalog doc', () => {
    const m = buildModel([comic({ line: 'ghost-line', slug: 'z' })], [], [], CFG)
    expect(m.lines).toHaveLength(1)
    expect(m.lines[0].tally.label).toBe('Ghost Line')
  })

  it('files program-less comics under Unassigned rather than dropping them', () => {
    const m = buildModel(comics, null, null, CFG)
    const indic = m.lines.find((l) => l.tally.key === 'indic')!
    expect(indic.programs[0].tally.label).toBe('Unassigned')
    expect(indic.programs[0].comics).toHaveLength(1)
  })

  it('is empty-safe', () => {
    const m = buildModel([], null, null, null)
    expect(m.studio.comics).toBe(0)
    expect(m.studio.progress).toBeNull()
    expect(m.lines).toEqual([])
  })
})

describe('trend', () => {
  it('counts starts from created and activity from dated changelog', () => {
    const t = buildTrend([
      comic({ slug: 'a', created: '2026-01-15', changelog: [{ date: '2026-01-20', note: 'x' }, { date: '2026-02-02', note: 'y' }] }),
      comic({ slug: 'b', created: '2026-02-01', changelog: [] , updated: '2026-02-11' }),
    ])
    const jan = t.find((p) => p.month === '2026-01')!
    const feb = t.find((p) => p.month === '2026-02')!
    expect(jan.started).toBe(1)
    expect(jan.touched).toBe(1)
    expect(feb.started).toBe(1)
    // comic a edited in Feb, comic b falls back to its `updated`
    expect(feb.touched).toBe(2)
    expect(feb.cumulative).toBe(2)
  })

  it('counts a comic once per month however many times it was edited', () => {
    const t = buildTrend([
      comic({ created: '2026-03-01', changelog: [{ date: '2026-03-02', note: 'a' }, { date: '2026-03-09', note: 'b' }] }),
    ])
    expect(t.find((p) => p.month === '2026-03')!.touched).toBe(1)
  })

  it('ignores undated changelog strings', () => {
    const t = buildTrend([comic({ created: '2026-04-01', changelog: ['no date here'] })])
    expect(t).toHaveLength(1)
    expect(t[0].touched).toBe(0)
  })
})

describe('export', () => {
  it('exports one row per comic with the resolved rate', () => {
    const rows = exportRows(buildModel([comic({ slug: 'special' })], null, null, CFG))
    expect(rows).toHaveLength(1)
    expect(rows[0]['Rate per page (INR)']).toBe(1000)
    expect(rows[0]['Rate source']).toBe('comic')
    expect(rows[0]['Pages %']).toBe(50)
  })
})

describe('writes', () => {
  beforeEach(() => {
    mockSetDoc.mockReset()
    mockGetDoc.mockReset()
  })

  it('always merges, so two admins editing different lines cannot clobber', async () => {
    await setLineRate('indic', 400, 'adnan@thothica.com')
    const [ref, body, opts] = mockSetDoc.mock.calls[0]
    expect(ref).toEqual({ __path: 'pricing/config' })
    expect(body.lines).toEqual({ indic: 400 })
    expect(body.updatedBy).toBe('adnan@thothica.com')
    expect(opts).toEqual({ merge: true })
  })

  it('writes a comic override under its composite key', async () => {
    await setComicRate('biographies', 'steve-jobs', 400, 'a@b.com')
    expect(mockSetDoc.mock.calls[0][1].comics).toEqual({ 'biographies__steve-jobs': 400 })
  })

  it('clears an override by rewriting the map, since merge cannot delete a key', async () => {
    mockGetDoc.mockResolvedValue({
      data: () => ({ comics: { 'biographies__a': 300, 'biographies__b': 900 } }),
    })
    await clearComicRate('biographies', 'a', 'a@b.com')
    expect(mockSetDoc.mock.calls[0][1].comics).toEqual({ 'biographies__b': 900 })
  })

  it('clearing an override on an empty config does not throw', async () => {
    mockGetDoc.mockResolvedValue({ data: () => undefined })
    await clearComicRate('biographies', 'a', 'a@b.com')
    expect(mockSetDoc.mock.calls[0][1].comics).toEqual({})
  })

  it('seeds every line at one rate', async () => {
    await seedLineRates(['biographies', 'indic'], 250, 'a@b.com')
    const body = mockSetDoc.mock.calls[0][1]
    expect(body.lines).toEqual({ biographies: 250, indic: 250 })
    expect(body.defaultRatePerPage).toBe(250)
  })
})

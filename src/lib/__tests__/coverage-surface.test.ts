import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, googleProvider: {} }))
import { filterCoverageBySurface, surfaceIndex } from '@/lib/surface'
import type { Coverage, Line } from '@/types/content'

const L = (slug: string, figures: number, total: number) => ({
  slug, title: slug, subtitle: '', figures, programs: [],
  comics: { total, draft: total, in_review: 0, approved: 0, published: 0 },
})
// The real shape published to meta/coverage.
const coverage = {
  generated_at: '', source_sha: '',
  totals: { lines: 9, figures: 323, comics: 113, published: 4, approved: 2, in_review: 26, draft: 81 },
  lines: [L('indic',217,22), L('biographies',88,51), L('medicomics',11,16), L('awareness',3,4),
          L('manga-indic',0,4), L('did-you-know',1,1), L('toddlers',0,7), L('legacy',0,5), L('tingaland',0,3)],
} as unknown as Coverage

describe('coverage on each surface', () => {
  const line = (slug: string) => ({ slug, title: slug, subtitle: '', comics: [], figures: [] }) as Line
  it('comics surface keeps the eight comics lines and real totals', () => {
    const comicsLines = coverage.lines.filter(l => l.slug !== 'manga-indic').map(l => line(l.slug))
    const out = filterCoverageBySurface(coverage, 'comics', surfaceIndex(comicsLines))
    expect(out.lines).toHaveLength(8)
    expect(out.totals.figures).toBe(320)
    expect(out.totals.comics).toBe(109)
  })
  it('manga surface keeps only manga-indic', () => {
    const out = filterCoverageBySurface(coverage, 'manga', surfaceIndex([line('manga-indic')]))
    expect(out.lines.map(l => l.slug)).toEqual(['manga-indic'])
    expect(out.totals.comics).toBe(4)
  })
  it('an unknown-line catalog still resolves by prefix', () => {
    const out = filterCoverageBySurface(coverage, 'comics', surfaceIndex(null))
    expect(out.lines).toHaveLength(8)
    expect(out.totals.figures).toBe(320)
  })
})

describe('an empty filter never renders as zeros', () => {
  it('falls back to the unfiltered roll-up rather than showing 0/0/0', () => {
    // A surface the running bundle cannot resolve for any line — what a stale
    // deploy looks like from the browser's side.
    const out = filterCoverageBySurface(coverage, 'manga', () => 'comics')
    expect(out.lines).toHaveLength(9)
    expect(out.totals.figures).toBe(323)
    expect(out.totals.lines).not.toBe(0)
  })
})

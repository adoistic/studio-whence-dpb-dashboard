import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// The pure helpers are what matter here; the hooks need Firebase, so stub the
// SDK handles rather than the module under test.
vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, googleProvider: {} }))

import {
  filterCoverageBySurface,
  lineOfComicId,
  parseSurfaceScope,
  resolveActiveSurface,
  surfaceIndex,
  surfaceOfLine,
  surfacesFromGrants,
  useActiveSurface,
  __resetSurfaceStore,
  type Surface,
} from '@/lib/surface'
import type { Coverage, Line } from '@/types/content'

const line = (slug: string, extra: Partial<Line> = {}): Line =>
  ({ slug, title: slug, subtitle: '', comics: [], figures: [], ...extra }) as Line

describe('surfaceOfLine', () => {
  it('honours an explicit surface on the line doc', () => {
    expect(surfaceOfLine(line('biographies', { surface: 'manga' }))).toBe('manga')
  })

  it('reads the surface off the line-slug prefix', () => {
    expect(surfaceOfLine(line('manga-indic'))).toBe('manga')
  })

  it('defaults every other line to comics, so nothing that exists today moves', () => {
    for (const slug of ['biographies', 'indic', 'awareness', 'legacy', 'toddlers']) {
      expect(surfaceOfLine(line(slug))).toBe('comics')
    }
  })

  it('rejects a surface value that is not one of the two', () => {
    expect(surfaceOfLine(line('biographies', { surface: 'zines' }))).toBe('comics')
  })
})

describe('surfaceIndex', () => {
  const lines = [
    line('manga-indic', { programs: [{ slug: 'manga-indic', line: 'manga-indic', title: 'Indic' }] }),
    line('indic', { programs: [{ slug: 'ramayana', line: 'indic', title: 'Ramayana' }] }),
  ]

  it('resolves a line slug', () => {
    expect(surfaceIndex(lines)('manga-indic')).toBe('manga')
    expect(surfaceIndex(lines)('indic')).toBe('comics')
  })

  it('resolves a program slug through the line that owns it', () => {
    expect(surfaceIndex(lines)('manga-indic')).toBe('manga')
    expect(surfaceIndex(lines)('ramayana')).toBe('comics')
  })

  it('falls back for a slug the catalog has never heard of', () => {
    expect(surfaceIndex(lines)('who-knows')).toBe('comics')
    expect(surfaceIndex(null)('manga-indic')).toBe('manga')
  })
})

describe('lineOfComicId', () => {
  it('takes the line from a `{line}__{slug}` document id', () => {
    expect(lineOfComicId('manga-indic__hanuman-vol-1')).toBe('manga-indic')
    expect(lineOfComicId('biographies__the-polyester-dream')).toBe('biographies')
  })

  it('leaves an id with no separator alone', () => {
    expect(lineOfComicId('legacy')).toBe('legacy')
  })
})

describe('surfacesFromGrants', () => {
  const resolve = surfaceIndex([
    line('manga-indic', { programs: [{ slug: 'manga-indic', line: 'manga-indic', title: 'Indic' }] }),
    line('indic'),
  ])

  it('is empty when nothing is granted', () => {
    expect(surfacesFromGrants({ lines: [], programs: [], comics: [] }, resolve)).toEqual([])
  })

  it('derives one surface from a line grant', () => {
    expect(surfacesFromGrants({ lines: ['indic'], programs: [], comics: [] }, resolve)).toEqual(['comics'])
  })

  it('derives the manga surface from a program grant', () => {
    expect(surfacesFromGrants({ lines: [], programs: ['manga-indic'], comics: [] }, resolve))
      .toEqual(['manga'])
  })

  it('derives the surface from a comic grant through its document id', () => {
    expect(surfacesFromGrants({ lines: [], programs: [], comics: ['manga-indic__hanuman'] }, resolve))
      .toEqual(['manga'])
  })

  it('returns both, in a stable order, when the grants span both', () => {
    expect(surfacesFromGrants({ lines: ['indic'], programs: ['manga-indic'], comics: [] }, resolve))
      .toEqual(['comics', 'manga'])
  })

  it('folds in figure-derived lines', () => {
    expect(surfacesFromGrants({ lines: [], programs: [], comics: [] }, resolve, ['manga-indic']))
      .toEqual(['manga'])
  })
})

describe('parseSurfaceScope', () => {
  it('treats a missing field as unscoped, which is what every existing sub-admin has', () => {
    expect(parseSurfaceScope(undefined)).toBeNull()
    expect(parseSurfaceScope(null)).toBeNull()
  })

  it('treats an empty list as unscoped rather than as "no surfaces"', () => {
    expect(parseSurfaceScope([])).toBeNull()
  })

  it('keeps a single-surface scope', () => {
    expect(parseSurfaceScope(['manga'])).toEqual(['manga'])
  })

  it('drops values that are not surfaces', () => {
    expect(parseSurfaceScope(['manga', 'zines'])).toEqual(['manga'])
    expect(parseSurfaceScope(['zines'])).toBeNull()
  })
})

describe('resolveActiveSurface', () => {
  const both: Surface[] = ['comics', 'manga']

  it('owes a choice when both are available and none is stored', () => {
    expect(resolveActiveSurface(null, both)).toBeNull()
  })

  it('keeps a stored choice that is still available', () => {
    expect(resolveActiveSurface('manga', both)).toBe('manga')
  })

  it('owes a fresh choice when the stored one is no longer available', () => {
    expect(resolveActiveSurface('manga', ['comics', 'manga'].slice(0, 1) as Surface[])).toBe('comics')
  })

  it('never asks when there is only one', () => {
    expect(resolveActiveSurface(null, ['manga'])).toBe('manga')
  })

  it('resolves to nothing when there are no surfaces at all', () => {
    expect(resolveActiveSurface('manga', [])).toBeNull()
    expect(resolveActiveSurface('manga', null)).toBeNull()
  })
})

describe('filterCoverageBySurface', () => {
  const coverage: Coverage = {
    generated_at: '2026-08-11',
    source_sha: 'abc',
    totals: { lines: 2, figures: 30, comics: 12, published: 4, approved: 3, in_review: 3, draft: 2 },
    lines: [
      {
        slug: 'indic', title: 'Indic', subtitle: '', figures: 25, programs: [],
        comics: { total: 10, draft: 1, in_review: 2, approved: 3, published: 4 },
      },
      {
        slug: 'manga-indic', title: 'Indic', subtitle: '', figures: 5, programs: [],
        comics: { total: 2, draft: 1, in_review: 1, approved: 0, published: 0 },
      },
    ],
  }
  const resolve = surfaceIndex(null)

  it('returns the roll-up untouched when no surface is active', () => {
    expect(filterCoverageBySurface(coverage, null, resolve)).toBe(coverage)
  })

  it('keeps only the lines of the active surface', () => {
    const out = filterCoverageBySurface(coverage, 'manga', resolve)
    expect(out.lines.map((l) => l.slug)).toEqual(['manga-indic'])
  })

  it('recomputes the totals so they agree with the lines shown', () => {
    const out = filterCoverageBySurface(coverage, 'manga', resolve)
    expect(out.totals).toEqual({
      lines: 1, figures: 5, comics: 2, published: 0, approved: 0, in_review: 1, draft: 1,
    })
  })

  it('recomputes for the comics surface too', () => {
    const out = filterCoverageBySurface(coverage, 'comics', resolve)
    expect(out.lines.map((l) => l.slug)).toEqual(['indic'])
    expect(out.totals.figures).toBe(25)
    expect(out.totals.comics).toBe(10)
  })

  it('returns the same object when the filter removes nothing', () => {
    const comicsOnly: Coverage = { ...coverage, lines: [coverage.lines[0]] }
    expect(filterCoverageBySurface(comicsOnly, 'comics', resolve)).toBe(comicsOnly)
  })
})

// ── The redirect-loop regression ─────────────────────────────────────────────
//
// The active surface is shared state. When it was per-component useState, the
// chooser's write never reached the layout's copy, so the layout kept seeing
// "both surfaces available, no choice made" and redirected back to /choose on
// every click. These tests fail against that implementation.

describe('useActiveSurface shares one value across components', () => {
  beforeEach(() => {
    window.localStorage.clear()
    __resetSurfaceStore()
  })

  it('a write in one component is visible in another', async () => {
    const chooser = renderHook(() => useActiveSurface())
    const layout = renderHook(() => useActiveSurface())

    expect(layout.result.current.surface).toBeNull()

    await act(async () => { chooser.result.current.setSurface('manga') })

    // The layout must see it. This is the assertion that was failing in prod.
    expect(layout.result.current.surface).toBe('manga')
    expect(chooser.result.current.surface).toBe('manga')
  })

  it('persists the choice so the next mount does not ask again', async () => {
    const first = renderHook(() => useActiveSurface())
    await act(async () => { first.result.current.setSurface('comics') })

    __resetSurfaceStore()
    const remounted = renderHook(() => useActiveSurface())
    await waitFor(() => expect(remounted.result.current.ready).toBe(true))
    expect(remounted.result.current.surface).toBe('comics')
  })

  it('the layout would not redirect once a choice is made', async () => {
    const chooser = renderHook(() => useActiveSurface())
    const layout = renderHook(() => useActiveSurface())
    await act(async () => { chooser.result.current.setSurface('manga') })

    // The exact condition the layout guards on.
    const available: Surface[] = ['comics', 'manga']
    const owed = !(layout.result.current.surface
      && available.includes(layout.result.current.surface))
    expect(owed).toBe(false)
  })
})

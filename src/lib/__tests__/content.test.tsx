import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Content } from '@/types/content'
import {
  ContentProvider,
  useComic,
  useContent,
  useLine,
  findComic,
  findLine,
  requireLine,
} from '../content'
import { fetchContent } from '@/lib/dataApi'

vi.mock('@/lib/dataApi', () => ({ fetchContent: vi.fn() }))

const mockedFetchContent = vi.mocked(fetchContent)

// Inline Content fixture (mirrors the shape from the old content.test.ts) —
// the public bundle no longer ships data, so loader/provider tests must not
// depend on it.
const fixture: Content = {
  generated_at: '2026-06-01T00:00:00Z',
  source_sha: 'test',
  headline: { figures_researched: 0, comics_in_production: 1, lines_active: 4 },
  lines: [
    {
      slug: 'biographies',
      title: 'Biographies',
      subtitle: 'Little Chanakya Presents…',
      comics: [
        {
          title: 'The Man Who Built Trust',
          slug: '01-the-man-who-built-trust',
          subject_slug: 'ratan-tata',
          subject: 'Ratan Tata',
          line: 'biographies',
          status: 'draft',
        },
      ],
      figures: [],
    },
    { slug: 'awareness', title: 'Awareness', subtitle: '', comics: [], figures: [] },
    { slug: 'indic', title: 'Indic', subtitle: '', comics: [], figures: [] },
    { slug: 'toddlers', title: 'Toddlers', subtitle: '', comics: [], figures: [] },
    // A fifth line whose slug is outside the original four — proves LineSlug is
    // data (string), not a closed union, so a new line needs no type change.
    { slug: 'bollywood-legends', title: 'Bollywood Legends', subtitle: '', comics: [], figures: [] },
  ],
  activity: [],
  images: [],
}

function wrapper({ children }: { children: ReactNode }) {
  return <ContentProvider>{children}</ContentProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('pure helpers (moved from content.ts)', () => {
  test('findLine returns the matching line', () => {
    const line = findLine('biographies', fixture)
    expect(line).toBeDefined()
    expect(line?.slug).toBe('biographies')
  })

  test('findLine returns undefined for an unknown slug', () => {
    expect(findLine('nope', fixture)).toBeUndefined()
  })

  test('findLine resolves a fifth line whose slug is outside the original four', () => {
    const line = findLine('bollywood-legends', fixture)
    expect(line).toBeDefined()
    expect(line?.slug).toBe('bollywood-legends')
    expect(line?.title).toBe('Bollywood Legends')
  })

  test('findComic finds a known comic slug', () => {
    const comic = findComic('biographies', '01-the-man-who-built-trust', fixture)
    expect(comic).toBeDefined()
    expect(comic?.subject).toBe('Ratan Tata')
  })

  test('findComic returns undefined for a missing slug', () => {
    expect(findComic('biographies', 'no-such-comic', fixture)).toBeUndefined()
  })

  test('requireLine returns the biographies line', () => {
    const line = requireLine('biographies', fixture)
    expect(line.slug).toBe('biographies')
  })

  test('requireLine throws for a missing slug', () => {
    expect(() => requireLine('nonexistent', fixture)).toThrow(
      'Line "nonexistent" missing from content.json'
    )
  })
})

describe('ContentProvider + useContent', () => {
  test('transitions loading:true → content set, loading:false', async () => {
    mockedFetchContent.mockResolvedValue(fixture)
    const { result } = renderHook(() => useContent(), { wrapper })

    // Initial synchronous render: still loading, no content yet.
    expect(result.current.loading).toBe(true)
    expect(result.current.content).toBeNull()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.content).toEqual(fixture)
    expect(result.current.error).toBeUndefined()
    expect(mockedFetchContent).toHaveBeenCalledTimes(1)
  })

  test('error path: a rejected fetch ends loading:false with an error, no throw', async () => {
    const boom = new Error('content fetch failed: 403')
    mockedFetchContent.mockRejectedValue(boom)
    const { result } = renderHook(() => useContent(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.content).toBeNull()
    expect(result.current.error).toBe(boom)
  })

  test('useContent throws a clear error outside a provider', () => {
    // Silence the expected React error-boundary console noise.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useContent())).toThrow(
      /useContent must be used within a ContentProvider/
    )
    spy.mockRestore()
  })
})

describe('useLine / useComic', () => {
  test('useLine resolves a known line and undefined for missing', async () => {
    mockedFetchContent.mockResolvedValue(fixture)
    const { result } = renderHook(
      () => ({ bio: useLine('biographies'), missing: useLine('nope') }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.bio).toBeDefined())
    expect(result.current.bio?.slug).toBe('biographies')
    expect(result.current.missing).toBeUndefined()
  })

  test('useLine resolves a fifth line whose slug is outside the original four', async () => {
    mockedFetchContent.mockResolvedValue(fixture)
    const { result } = renderHook(() => useLine('bollywood-legends'), { wrapper })

    await waitFor(() => expect(result.current).toBeDefined())
    expect(result.current?.slug).toBe('bollywood-legends')
    expect(result.current?.title).toBe('Bollywood Legends')
  })

  test('useComic resolves a known comic and undefined for unknown', async () => {
    mockedFetchContent.mockResolvedValue(fixture)
    const { result } = renderHook(
      () => ({
        known: useComic('biographies', '01-the-man-who-built-trust'),
        unknown: useComic('biographies', 'no-such-comic'),
      }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.known).toBeDefined())
    expect(result.current.known?.subject).toBe('Ratan Tata')
    expect(result.current.unknown).toBeUndefined()
  })

  test('useLine returns undefined while still loading', () => {
    // Never-resolving fetch keeps content null.
    mockedFetchContent.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useLine('biographies'), { wrapper })
    expect(result.current).toBeUndefined()
  })
})

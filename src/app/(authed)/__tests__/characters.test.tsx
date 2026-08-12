/**
 * Tests for src/app/(authed)/characters/page.tsx + src/components/CharacterRoster.tsx.
 *
 * The Characters tab is the studio-wide art build list. What is pinned here:
 *
 *   1. SURFACE SEPARATION — the page reads only the active surface's roster
 *      docs, so `manga-indic`'s cast can never appear on the comics surface and
 *      the comics cast can never appear on the manga surface. Asserted from the
 *      Firestore reads the page actually issues, not just from the render.
 *   2. PLACEHOLDERS — an undrawn version renders as a labelled card naming the
 *      comics and page count waiting on it. 681 of the 1,168 characters have no
 *      art; hiding them would make the roster read as finished.
 *   3. Filters (line / drawn / owed / search) and the headline counts.
 *
 * Mocks follow the house idiom: reassignable module-level `let mockUseX`
 * forwarded through an arrow, so hoisting is safe and each test can vary them.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { Line } from '@/types/content'
import type { RosterDoc } from '@/lib/characters'
import CharactersPage from '../characters/page'

// ─── Mocks ───────────────────────────────────────────────────────────────────

let mockUseLines: () => { data: Line[] | null; loading: boolean }
let mockSurface: () => 'comics' | 'manga' | null

vi.mock('@/lib/catalog', () => ({ useLines: () => mockUseLines() }))

// The active surface comes from the real surface module elsewhere; here it is
// stubbed so a test can sit on either surface deterministically. Everything
// else in surface.ts (surfaceOfLineSlug, SURFACE_LABEL) stays REAL — it is the
// separation logic under test.
vi.mock('@/lib/surface', async (orig) => ({
  ...(await orig<typeof import('@/lib/surface')>()),
  useActiveSurface: () => ({ surface: mockSurface(), ready: true, setSurface: () => {} }),
}))

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, googleProvider: {} }))
vi.mock('@/lib/useResolved', () => ({ useResolved: () => ({}) }))
vi.mock('@/lib/dataApi', () => ({ resolveUrls: async () => ({}) }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

// Record which meta docs the page asks Firestore for — the sharpest possible
// assertion that a manga roster is never even READ on the comics surface.
const readDocIds: string[] = []
const DOCS: Record<string, RosterDoc> = {}

// surface.ts (kept real) and its transitive imports pull several Firestore
// helpers in; they are stubbed inert because nothing in this tree calls them.
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  getDoc: async (ref: { id: string }) => {
    readDocIds.push(ref.id)
    const data = DOCS[ref.id]
    return { exists: () => Boolean(data), data: () => data }
  },
  collection: () => ({}),
  documentId: () => ({}),
  getDocs: async () => ({ docs: [] }),
  query: () => ({}),
  where: () => ({}),
  setDoc: async () => {},
  updateDoc: async () => {},
  deleteDoc: async () => {},
  deleteField: () => ({}),
  serverTimestamp: () => ({}),
  Timestamp: { fromMillis: () => ({}) },
}))

// ─── Fixtures ────────────────────────────────────────────────────────────────

const line = (slug: string, title: string): Line =>
  ({ slug, title, subtitle: '', comics: [], figures: [] }) as Line

const ALL_LINES = [line('indic', 'Indic'), line('awareness', 'Awareness'), line('manga-indic', 'Manga · Indic')]

DOCS['characters_indic'] = {
  line: 'indic', surface: 'comics',
  count: 2, drawn: 1, owed: 1, versions: 3, versionsDrawn: 1, comics: 1,
  people: [
    {
      slug: 'ram', name: 'Ram', line: 'indic', drawn: true, pages: 40, comics: ['01-ramayana'],
      versions: [
        {
          stage: 'prince', drawn: true, key: 'artifacts/characters/indic/ram/prince.png',
          comics: [{ slug: '01-ramayana', title: 'Ramayana', pages: [1, 2] }], pages: 25,
        },
        {
          stage: 'exile', drawn: false, key: null,
          comics: [{ slug: '01-ramayana', title: 'Ramayana', pages: [30, 31] }], pages: 15,
        },
      ],
    },
    {
      slug: 'sita', name: 'Sita', line: 'indic', drawn: false, pages: 18, comics: ['01-ramayana'],
      versions: [
        {
          stage: '—', drawn: false, key: null,
          comics: [{ slug: '01-ramayana', title: 'Ramayana', pages: [4] }], pages: 18,
        },
      ],
    },
  ],
}

DOCS['characters_awareness'] = {
  line: 'awareness', surface: 'comics',
  count: 1, drawn: 1, owed: 0, versions: 1, versionsDrawn: 1, comics: 1,
  people: [
    {
      slug: 'nila', name: 'Nila', line: 'awareness', drawn: true, pages: 9, comics: ['01-future-shock'],
      versions: [
        {
          stage: 'teen', drawn: true, key: 'artifacts/characters/awareness/nila/teen.png',
          comics: [{ slug: '01-future-shock', title: 'Future Shock', pages: [2] }], pages: 9,
        },
      ],
    },
  ],
}

DOCS['characters_manga-indic'] = {
  line: 'manga-indic', surface: 'manga',
  count: 1, drawn: 0, owed: 1, versions: 1, versionsDrawn: 0, comics: 1,
  people: [
    {
      slug: 'ram', name: 'Ram', line: 'manga-indic', drawn: false, pages: 64, comics: ['vol-1'],
      versions: [
        {
          stage: '—', drawn: false, key: null,
          comics: [{ slug: 'vol-1', title: 'Ramayana Volume One', pages: [1] }], pages: 64,
        },
      ],
    },
  ],
}

beforeEach(() => {
  readDocIds.length = 0
  mockUseLines = () => ({ data: ALL_LINES, loading: false })
  mockSurface = () => 'comics'
})

// ─── Surface separation ──────────────────────────────────────────────────────

describe('/characters — surface separation', () => {
  test('the comics surface never reads, nor renders, a manga roster', async () => {
    render(<CharactersPage />)
    expect(await screen.findByRole('heading', { name: 'Ram' })).toBeInTheDocument()

    expect(readDocIds).toContain('characters_indic')
    expect(readDocIds).toContain('characters_awareness')
    expect(readDocIds).not.toContain('characters_manga-indic')

    // The manga book title would be the giveaway if a manga character slipped in.
    expect(screen.queryByText('Ramayana Volume One')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Manga · Indic' })).not.toBeInTheDocument()
  })

  test('the manga surface never reads, nor renders, a comics roster', async () => {
    mockSurface = () => 'manga'
    render(<CharactersPage />)
    expect(await screen.findByText('Ramayana Volume One')).toBeInTheDocument()

    expect(readDocIds).toEqual(['characters_manga-indic'])
    expect(screen.queryByRole('heading', { name: 'Sita' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nila' })).not.toBeInTheDocument()
  })

  test('the same slug on two surfaces stays two different characters', async () => {
    // Indic's Ram is drawn as a prince; manga/indic's Ram has no art at all.
    render(<CharactersPage />)
    const comicsRam = await screen.findByRole('heading', { name: 'Ram' })
    expect(within(comicsRam.closest('article')!).getByText('prince')).toBeInTheDocument()

    mockSurface = () => 'manga'
    const { container } = render(<CharactersPage />)
    expect(within(container).queryByText('prince')).not.toBeInTheDocument()
  })
})

// ─── Placeholders ────────────────────────────────────────────────────────────

describe('/characters — undrawn work is visible, not hidden', () => {
  test('an undrawn version renders a labelled placeholder card', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { name: 'Ram' })
    // Ram's exile version + Sita's only version are both still to draw.
    expect(screen.getAllByText('Not drawn yet')).toHaveLength(2)
    expect(screen.getAllByText('placeholder')).toHaveLength(2)
  })

  test('a placeholder names the comic and the pages waiting on it', async () => {
    render(<CharactersPage />)
    const sita = await screen.findByRole('heading', { name: 'Sita' })
    const card = sita.closest('article')!
    expect(within(card).getByText('18 pages waiting')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Ramayana' })).toHaveAttribute(
      'href', '/indic/01-ramayana',
    )
  })

  test('a character with no art at all still appears in the list', async () => {
    render(<CharactersPage />)
    expect(await screen.findByRole('heading', { name: 'Sita' })).toBeInTheDocument()
  })

  test('the header counts drawn versus owed for the whole surface', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { name: 'Ram' })
    // 3 characters (Ram, Sita, Nila) · 2 of 4 versions drawn · 1 with no art.
    expect(screen.getByText(/3 characters/)).toBeInTheDocument()
    expect(screen.getByText(/2 of 4 versions drawn/)).toBeInTheDocument()
    expect(screen.getByText(/1 with no art yet/)).toBeInTheDocument()
  })
})

// ─── Filters ─────────────────────────────────────────────────────────────────

describe('/characters — filters', () => {
  test('the line filter offers only this surface’s lines', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { name: 'Ram' })
    expect(screen.getByRole('button', { name: 'Indic' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Awareness' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Manga · Indic' })).not.toBeInTheDocument()
  })

  test('filtering by line narrows the list', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { name: 'Ram' })
    fireEvent.click(screen.getByRole('button', { name: 'Awareness' }))
    expect(screen.getByRole('heading', { name: 'Nila' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ram' })).not.toBeInTheDocument()
  })

  test('"Still to draw" is the build list', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { name: 'Ram' })
    fireEvent.click(screen.getByRole('button', { name: 'Still to draw' }))
    // Ram has an undrawn exile version; Sita has nothing; Nila is complete.
    expect(screen.getByRole('heading', { name: 'Ram' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sita' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nila' })).not.toBeInTheDocument()
  })

  test('"Drawn" keeps only characters that have art', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { name: 'Ram' })
    fireEvent.click(screen.getByRole('button', { name: 'Drawn' }))
    expect(screen.queryByRole('heading', { name: 'Sita' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nila' })).toBeInTheDocument()
  })

  test('the search box finds a character by name', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { name: 'Ram' })
    fireEvent.change(screen.getByLabelText('Find a character'), { target: { value: 'sit' } })
    expect(screen.getByRole('heading', { name: 'Sita' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ram' })).not.toBeInTheDocument()
  })

  test('a search that matches nothing says so', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { name: 'Ram' })
    fireEvent.change(screen.getByLabelText('Find a character'), { target: { value: 'zzz' } })
    expect(screen.getByText('No character matches that.')).toBeInTheDocument()
  })
})

// ─── Quiet states ────────────────────────────────────────────────────────────

describe('/characters — quiet states', () => {
  test('a surface with no roster published says so rather than rendering empty', async () => {
    mockUseLines = () => ({ data: [line('toddlers', 'Toddlers')], loading: false })
    render(<CharactersPage />)
    expect(await screen.findByText('No roster published yet')).toBeInTheDocument()
  })

  test('exports are offered once there is a roster', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { name: 'Ram' })
    expect(screen.getByRole('button', { name: /Download PDF/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /PNG bundle/ })).toBeInTheDocument()
  })
})

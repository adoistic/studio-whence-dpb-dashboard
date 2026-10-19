/**
 * Tests for src/app/(authed)/characters/page.tsx — the studio-wide cast.
 *
 * The page is `WorkCharacters` over every cast the viewer may see on the active
 * surface. What is pinned here:
 *
 *   1. SURFACE SEPARATION — a manga cast never appears on the comics surface, nor the
 *      reverse, and the manga Rama and the Indic Rama stay two characters.
 *   2. SHARED IP — Little Chanakya appears ONCE, badged, with every book that stages
 *      him linked to the line that publishes it.
 *   3. GATING — a moderator lists the collection; a member reads only the casts of
 *      their visible comics (and those lines' libraries), never the collection.
 *   4. PLACEHOLDERS — undrawn versions and text-only stock extras are shown, labelled.
 *   5. Filters and the empty state.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { CastDoc } from '@/lib/castModel'
import { __clearCastCache } from '@/lib/casts'
import CharactersPage from '../characters/page'

let mockSurface: 'comics' | 'manga' | null = 'comics'
let mockModerator = true
let mockVisible: { line: string; slug: string }[] = []

vi.mock('@/lib/catalog', () => ({
  useLines: () => ({
    data: [
      { slug: 'indic', title: 'Indic' },
      { slug: 'awareness', title: 'Awareness' },
      { slug: 'manga-indic', title: 'Indic (manga)' },
    ],
    loading: false,
  }),
}))
vi.mock('@/lib/surface', async (orig) => ({
  ...(await orig<typeof import('@/lib/surface')>()),
  useActiveSurface: () => ({ surface: mockSurface, ready: true, setSurface: () => {} }),
}))
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: { email: 'member@dpb.in' }, loading: false }),
  useAllowStatus: () => (mockModerator ? 'sub_admin' : 'allowed'),
  canModerate: (s: string) => s === 'sub_admin',
}))
vi.mock('@/lib/visibleCatalog', () => ({
  useVisibleComics: (_canMod: boolean, email: string | null) => ({
    data: email ? mockVisible : [],
    loading: false,
  }),
}))
vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, googleProvider: {} }))
vi.mock('@/lib/useResolved', () => ({ useResolved: () => ({}), refreshResolved: () => {} }))
vi.mock('@/lib/dataApi', () => ({ resolveUrls: async () => ({}) }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

const DOCS: Record<string, CastDoc> = {}
const reads: string[] = []
let listed = 0

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  getDoc: async (ref: { id: string }) => {
    reads.push(ref.id)
    const data = DOCS[ref.id]
    return { exists: () => Boolean(data), data: () => data }
  },
  collection: () => ({}),
  getDocs: async () => {
    listed += 1
    return { docs: Object.values(DOCS).map((d) => ({ data: () => d })) }
  },
  documentId: () => ({}),
  query: () => ({}),
  where: () => ({}),
}))

function cast(comicId: string, title: string, people: CastDoc['people'], extra: Partial<CastDoc> = {}): CastDoc {
  const [line, slug] = comicId.split('__')
  return {
    comicId, line, slug, title, subject_slug: '', program_slug: '', library: false, source: 'test',
    counts: { characters: people.length, named: 0, generalized: 0, shared: 0, drawn: 0, undrawn: 0, versions: 0, versionsDrawn: 0 },
    people, ...extra,
  }
}

const drawn = (stage: string, label: string, line: string, id: string, pages: number[] = [1]) => ({
  stage, label, drawn: true, pages,
  key: `artifacts/characters/${line}/${id}/${stage}.png`, thumb: `artifacts/characters/${line}/${id}/web/${stage}.jpg`, bytes: 1000,
})

function seed() {
  for (const k of Object.keys(DOCS)) delete DOCS[k]
  DOCS['indic__01-man'] = cast('indic__01-man', 'Book One', [
    { id: 'rama', line: 'indic', name: 'Rama', kind: 'named', pages: [3, 4], versions: [drawn('rama-boy', 'Boy', 'indic', 'rama', [3, 4])] },
    { id: 'urmila', line: 'indic', name: 'Urmila', kind: 'named', pages: [9], versions: [{ stage: 'urmila', label: 'Main look', drawn: false, pages: [9] }] },
    { id: 'stock-sage', line: 'indic', name: 'Stock sage', kind: 'generalized', pages: [25], versions: [{ stage: 'sage', label: 'Sage', drawn: false, text: true, pages: [25] }] },
    { id: 'little-chanakya', line: 'shared', name: 'Little Chanakya', kind: 'shared', pages: [1], versions: [drawn('base', 'Main look', 'shared', 'little-chanakya')] },
  ])
  DOCS['awareness__01-cafe'] = cast('awareness__01-cafe', 'Book Two', [
    { id: 'little-chanakya', line: 'shared', name: 'Little Chanakya', kind: 'shared', pages: [2, 5], versions: [drawn('base', 'Main look', 'shared', 'little-chanakya', [2, 5])] },
    { id: 'abeer', line: 'awareness', name: 'Abeer', kind: 'named', pages: [2], versions: [drawn('base', 'Main look', 'awareness', 'abeer', [2])] },
  ])
  DOCS['manga-indic__01-prince'] = cast('manga-indic__01-prince', 'Volume One', [
    { id: 'rama', line: 'manga-indic', name: 'Rama', kind: 'named', pages: [1, 2], versions: [drawn('rama-court', 'Court', 'manga-indic', 'rama', [1, 2])] },
    { id: 'townsfolk', line: 'manga-indic', name: 'The townsfolk', kind: 'generalized', pages: [7], versions: [drawn('townsfolk', 'Main look', 'manga-indic', 'townsfolk', [7])] },
  ])
}

beforeEach(() => {
  seed()
  reads.length = 0
  listed = 0
  mockSurface = 'comics'
  mockModerator = true
  mockVisible = []
  __clearCastCache()
})

const names = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)

describe('/characters — surface separation', () => {
  test('the comics surface never lists a manga cast', async () => {
    render(<CharactersPage />)
    expect(await screen.findByRole('heading', { level: 3, name: 'Urmila' })).toBeInTheDocument()
    expect(names()).not.toContain('The townsfolk')
    expect(screen.queryByText('Volume One')).not.toBeInTheDocument()
  })

  test('the manga surface lists only the manga cast', async () => {
    mockSurface = 'manga'
    render(<CharactersPage />)
    expect(await screen.findByRole('heading', { level: 3, name: 'The townsfolk' })).toBeInTheDocument()
    expect(names()).not.toContain('Urmila')
    expect(names()).not.toContain('Abeer')
  })

  test('the manga Rama and the Indic Rama stay two characters', async () => {
    mockSurface = null
    render(<CharactersPage />)
    await screen.findByRole('heading', { level: 3, name: 'Urmila' })
    expect(names().filter((n) => n === 'Rama')).toHaveLength(2)
  })
})

describe('/characters — the shared cast', () => {
  test('Little Chanakya appears once, badged, with every book linked to its own line', async () => {
    render(<CharactersPage />)
    const heading = await screen.findByRole('heading', { level: 3, name: 'Little Chanakya' })
    expect(names().filter((n) => n === 'Little Chanakya')).toHaveLength(1)
    const card = heading.closest('article')!
    expect(within(card).getByText('Shared cast')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Book Two' })).toHaveAttribute('href', '/awareness/01-cafe')
    expect(within(card).getByRole('link', { name: 'Book One' })).toHaveAttribute('href', '/indic/01-man')
  })
})

describe('/characters — gating', () => {
  test('a moderator lists the collection once and reads no single docs', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { level: 3, name: 'Urmila' })
    expect(listed).toBe(1)
    expect(reads).toEqual([])
  })

  test('a member reads only their comics’ casts and those lines’ libraries', async () => {
    mockModerator = false
    mockVisible = [{ line: 'awareness', slug: '01-cafe' }]
    render(<CharactersPage />)
    expect(await screen.findByRole('heading', { level: 3, name: 'Abeer' })).toBeInTheDocument()
    expect(listed).toBe(0)
    expect(reads.sort()).toEqual(['awareness__01-cafe', 'awareness__library'])
    expect(names()).not.toContain('Urmila')
  })
})

describe('/characters — undrawn work is visible', () => {
  test('an undrawn version is a labelled placeholder; a stock extra says it lives in the page text', async () => {
    render(<CharactersPage />)
    const urmila = (await screen.findByRole('heading', { level: 3, name: 'Urmila' })).closest('article')!
    expect(within(urmila).getByText('Not drawn yet')).toBeInTheDocument()
    const sage = screen.getByRole('heading', { level: 3, name: 'Stock sage' }).closest('article')!
    expect(within(sage).getByText('Described in the page text')).toBeInTheDocument()
    expect(within(sage).getByText('Generalised')).toBeInTheDocument()
  })
})

describe('/characters — filters', () => {
  test('Not drawn yet, Drawn and Generalised narrow the list', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { level: 3, name: 'Urmila' })
    fireEvent.click(screen.getByRole('button', { name: /not drawn yet/i }))
    expect(names()).toEqual(['Urmila'])
    fireEvent.click(screen.getByRole('button', { name: /^drawn/i }))
    expect(names()).toEqual(expect.arrayContaining(['Rama', 'Abeer', 'Little Chanakya']))
    expect(names()).not.toContain('Urmila')
    fireEvent.click(screen.getByRole('button', { name: /generalised/i }))
    expect(names()).toEqual(['Stock sage'])
  })

  test('the line filter keeps the shared cast under every line that stages it', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { level: 3, name: 'Urmila' })
    fireEvent.click(screen.getByRole('button', { name: 'Awareness' }))
    expect(names().sort()).toEqual(['Abeer', 'Little Chanakya'])
  })

  test('the search box finds a character, and says so when nothing matches', async () => {
    render(<CharactersPage />)
    await screen.findByRole('heading', { level: 3, name: 'Urmila' })
    fireEvent.change(screen.getByLabelText('Find a character'), { target: { value: 'urm' } })
    expect(names()).toEqual(['Urmila'])
    fireEvent.change(screen.getByLabelText('Find a character'), { target: { value: 'zzz' } })
    expect(screen.getByText('No character matches that.')).toBeInTheDocument()
  })
})

describe('/characters — quiet states', () => {
  test('nothing published says so', async () => {
    for (const k of Object.keys(DOCS)) delete DOCS[k]
    render(<CharactersPage />)
    expect(await screen.findByText('No cast has been published for this surface yet.')).toBeInTheDocument()
  })
})

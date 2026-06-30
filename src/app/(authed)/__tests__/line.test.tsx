/**
 * Tests for src/app/(authed)/line/page.tsx
 *
 * The single data-driven /line page reads the line slug from the browser URL
 * (window.location.pathname) and resolves it against the Firestore catalog. These
 * tests pin the PAGE's routing logic only:
 *
 *   1. pathname /biographies + lines loaded → renders LinePageShell (line title shows)
 *   2. pathname /typo (slug absent from catalog) → graceful "line not found" state
 *   3. catalog still loading → quiet loading state
 *   4. catalog finished-but-failed → error state
 *
 * LinePageShell is stubbed (it internally resolves images + renders tables, which
 * are out of scope here), and @/lib/intros is stubbed to keep the MDX import chain
 * out of this unit test. The @/lib/catalog read hooks are mocked via the
 * forwarding-arrow pattern so each impl can be reassigned per test under hoisting.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Line, Comic, Figure } from '@/types/content'
import type { Async, PersonDoc } from '@/lib/catalog'
import LinePage from '../line/page'

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUseLines: () => Async<Line[]>
let mockUseFigures: () => Async<Figure[]>
let mockUsePeople: () => Async<PersonDoc[]>
let mockUsePrograms: () => Async<Line['programs']>

vi.mock('@/lib/catalog', () => ({
  useLines: () => mockUseLines(),
  usePeople: () => mockUsePeople(),
  usePrograms: () => mockUsePrograms(),
}))

// The page now reads the gated catalog (useVisibleComics/useVisibleFigures) and
// resolves the viewer's moderation status. Mock both so the unit stays focused on
// the page's routing + line-filter logic; the gating itself is covered in
// visibleCatalog.test.ts.
vi.mock('@/lib/visibleCatalog', () => ({
  useVisibleComics: (...a: unknown[]) => mockUseVisibleComics(...a),
  useVisibleFigures: () => mockUseFigures(),
  // Open (openResearch) figures are merged into the line page; these tests
  // don't exercise that path, so default to none.
  useOpenFigures: () => ({ data: [], loading: false }),
}))
vi.mock('@/lib/auth', () => ({
  useUser: () => mockUseUser(),
  useAllowStatus: () => mockStatus,
  canModerate: (s: string) => s === 'admin' || s === 'sub_admin',
}))

let mockUseVisibleComics: (...a: unknown[]) => Async<Comic[]>
let mockUseUser: () => { user: { email: string } | null; loading: boolean }
let mockStatus: string

// Stub LinePageShell — renders just the line title so "line title appears" holds,
// without dragging in image resolution / ComicsTable / PeopleTable.
vi.mock('@/components/LinePageShell', () => ({
  LinePageShell: ({ line }: { line: { title: string; comics: { slug: string }[] } }) => (
    <div>
      <div>{line.title}</div>
      {line.comics.map((c) => <div key={c.slug}>comic:{c.slug}</div>)}
    </div>
  ),
}))

// Stub the intro registry — the page guards on it, so an empty map is fine.
vi.mock('@/lib/intros', () => ({ INTROS: {} }))

// ─── Fixtures ───────────────────────────────────────────────────────────────

// Firestore line docs carry only {slug,title,subtitle}; the page reconstructs
// comics/figures from the other hooks.
const lineDocs = [
  { slug: 'biographies', title: 'Biographies', subtitle: 'Little Chanakya Presents…' },
  { slug: 'awareness', title: 'Awareness', subtitle: '' },
  { slug: 'indic', title: 'Indic', subtitle: '' },
  { slug: 'toddlers', title: 'Toddlers', subtitle: '' },
] as unknown as Line[]

const peopleDocs: PersonDoc[] = [
  { slug: 'dhirubhai-ambani', name: 'Dhirubhai Ambani', line: 'biographies', series: 'Business Maharajas', stage: 'draft', stage_rank: 2, comic_count: 1, sources_count: 5, words: 120000, furthest_comic_slug: null, is_orphan: false },
  { slug: 'ratan-tata', name: 'Ratan Tata', line: 'biographies', series: 'Business Maharajas', stage: 'researched', stage_rank: 0, comic_count: 0, sources_count: 8, words: 200000, furthest_comic_slug: null, is_orphan: false },
]

const loaded = <T,>(data: T): Async<T> => ({ data, loading: false })

// ─── Helpers ────────────────────────────────────────────────────────────────

function setPathname(pathname: string) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  setPathname('/')
  // Defaults: a moderator viewer; the secondary hooks resolve empty/loaded;
  // tests override useLines / the visible-comic set as needed.
  mockUseVisibleComics = () => loaded<Comic[]>([])
  mockUseFigures = () => loaded<Figure[]>([])
  mockUsePeople = () => loaded<PersonDoc[]>(peopleDocs)
  mockUsePrograms = () => loaded([])
  mockUseUser = () => ({ user: { email: 'mod@x.com' }, loading: false })
  mockStatus = 'admin'
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LinePage — data-driven /line routing', () => {
  test('renders LinePageShell for the line named by the URL slug', () => {
    setPathname('/biographies')
    mockUseLines = () => loaded(lineDocs)

    render(<LinePage />)

    expect(screen.getByText('Biographies')).toBeInTheDocument()
  })

  test('renders a graceful not-found state for a slug absent from the catalog', () => {
    setPathname('/typo')
    mockUseLines = () => loaded(lineDocs)

    render(<LinePage />)

    // No crash, and the line title for a real line must not appear.
    expect(screen.queryByText('Biographies')).not.toBeInTheDocument()
    expect(screen.getByText(/line not found/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  test('renders a quiet loading state while the catalog is loading', () => {
    setPathname('/biographies')
    mockUseLines = () => ({ data: null, loading: true })

    render(<LinePage />)

    expect(screen.queryByText('Biographies')).not.toBeInTheDocument()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  test('renders an error state when the catalog load finished but failed', () => {
    setPathname('/biographies')
    mockUseLines = () => ({ data: null, loading: false, error: new Error('boom') })

    render(<LinePage />)

    // A finished-but-failed load must not show the loading spinner forever,
    // and must not show a real line title.
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Biographies')).not.toBeInTheDocument()
    // The visible heading paragraph (the sr-only alert region also contains the
    // phrase after its mount effect fires, so match the <p> element specifically).
    expect(
      screen.getByText(/couldn.t load/i, { selector: 'p' }),
    ).toBeInTheDocument()
    // Exactly one role="alert" — the empty-then-filled sr-only live region, which
    // announces reliably once the mount effect populates it.
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t load/i)
  })

  test('a member sees only their visible comics, filtered to the line', () => {
    setPathname('/biographies')
    mockUseLines = () => loaded(lineDocs)
    mockUseUser = () => ({ user: { email: 'm@x.com' }, loading: false })
    mockStatus = 'allow' // a regular member
    // The gated read returns a comic in this line and one in another line; the
    // page must surface only the in-line comic.
    mockUseVisibleComics = () => loaded<Comic[]>([
      { slug: '01-a', line: 'biographies' } as unknown as Comic,
      { slug: '02-b', line: 'awareness' } as unknown as Comic,
    ])

    render(<LinePage />)

    expect(screen.getByText('comic:01-a')).toBeInTheDocument()
    expect(screen.queryByText('comic:02-b')).not.toBeInTheDocument()
  })
})

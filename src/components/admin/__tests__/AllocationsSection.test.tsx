import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ── auth: admin user ──────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: { email: 'adnan@thothica.com' }, loading: false }),
  useAllowStatus: () => 'admin',
}))

// ── members ─────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/admin', () => ({
  useMembers: () => ({
    data: [
      { email: 'ankit@dpb.in', role: 'member' },
      { email: 'sa@dpb.in', role: 'sub_admin' },
    ],
    loading: false,
  }),
}))

// ── allocation lib: controllable useAllocation + spy setGrants + real pure helpers ──

const { setGrants } = vi.hoisted(() => ({
  setGrants: vi.fn<
    (
      email: string,
      grants: { lines: string[]; figures: string[]; comics: string[] },
      opts: { adminEmail: string; subjectByComic: Record<string, string | undefined> },
    ) => Promise<void>
  >(() => Promise.resolve()),
}))

// The Allocation the hook returns, swapped per test before render.
let allocData: {
  email: string
  lines: string[]
  figures: string[]
  comics: string[]
  programs: string[]
  figures_effective: string[]
} | null = null

// The real allocation module imports @/lib/firebase (auth init blows up under
// jsdom), so we reimplement the small, pure add/remove helpers here to test the
// real add/remove semantics without dragging in Firebase.
type Grants = { lines: string[]; figures: string[]; comics: string[]; programs: string[] }
type Alloc = Grants & { email: string; figures_effective: string[] }
const listKey = (k: 'line' | 'figure' | 'comic' | 'program') =>
  (k === 'line' ? 'lines' : k === 'figure' ? 'figures'
    : k === 'comic' ? 'comics' : 'programs') as keyof Grants
const grantsOf = (a: Alloc): Grants =>
  ({ lines: [...a.lines], figures: [...a.figures], comics: [...a.comics], programs: [...a.programs] })

vi.mock('@/lib/allocation', () => ({
  useAllocation: () => ({ data: allocData, loading: false }),
  setGrants,
  addGrant: (a: Alloc, kind: 'line' | 'figure' | 'comic' | 'program', value: string): Grants => {
    const base = grantsOf(a)
    const key = listKey(kind)
    if (!base[key].includes(value)) base[key] = [...base[key], value]
    return base
  },
  removeGrant: (a: Alloc, kind: 'line' | 'figure' | 'comic' | 'program', value: string): Grants => {
    const base = grantsOf(a)
    const key = listKey(kind)
    base[key] = base[key].filter((v) => v !== value)
    return base
  },
}))

// ── catalog fixture ───────────────────────────────────────────────────────────────

const LINES = [
  { slug: 'biographies', title: 'Biographies', subtitle: '', comics: [], figures: [] },
  { slug: 'awareness', title: 'Awareness', subtitle: '', comics: [], figures: [] },
]
const FIGURES = [
  { series: 'cricket', slug: 'sachin-tendulkar', sources_count: 1, words: 10 },
  { series: 'tech', slug: 'steve-jobs', sources_count: 1, words: 10 },
]
const COMICS = [
  { title: 'The Polyester Dream', line: 'biographies', slug: '01-polyester', status: 'approved', subject_slug: 'dhirubhai-ambani' },
  { title: 'Master Blaster', line: 'biographies', slug: '01-master', status: 'approved', subject_slug: 'sachin-tendulkar' },
]

vi.mock('@/lib/catalog', () => ({
  useLines: () => ({ data: LINES, loading: false }),
  useFigures: () => ({ data: FIGURES, loading: false }),
  useComics: () => ({ data: COMICS, loading: false }),
}))

import { AllocationsSection } from '@/components/admin/AllocationsSection'

const ADMIN = 'adnan@thothica.com'

function selectMember(email = 'ankit@dpb.in') {
  fireEvent.change(screen.getByLabelText('Member'), { target: { value: email } })
}

beforeEach(() => {
  setGrants.mockClear()
  allocData = null
})

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe('AllocationsSection', () => {
  it('shows a seeded member’s grants grouped under Lines / Figures / Comics', () => {
    allocData = {
      email: 'ankit@dpb.in',
      lines: ['awareness'],
      figures: ['steve-jobs'],
      comics: ['biographies__01-master'],
      programs: [],
      figures_effective: ['steve-jobs', 'sachin-tendulkar'],
    }
    render(<AllocationsSection adminEmail={ADMIN} />)
    selectMember()

    // Grouped subheadings present.
    expect(screen.getByRole('heading', { name: /^lines$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^figures$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^comics$/i })).toBeInTheDocument()

    // A friendly label per chip; raw slug stored, title-cased / titled shown.
    // (Some labels — e.g. "Awareness" — also appear as picker <option>s, so we
    // assert via each chip's unique remove-button accessible name.)
    expect(screen.getByRole('button', { name: 'Remove line Awareness' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove figure Steve Jobs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove comic Master Blaster' })).toBeInTheDocument()
  })

  it('adding a comic calls setGrants with the comic id appended + subjectByComic map', () => {
    allocData = {
      email: 'ankit@dpb.in', lines: [], figures: [], comics: [], programs: [], figures_effective: [],
    }
    render(<AllocationsSection adminEmail={ADMIN} />)
    selectMember()

    fireEvent.change(screen.getByLabelText('Comic to add'), {
      target: { value: 'biographies__01-polyester' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add comic grant' }))

    expect(setGrants).toHaveBeenCalledTimes(1)
    const [email, grants, opts] = setGrants.mock.calls[0]
    expect(email).toBe('ankit@dpb.in')
    expect(grants.comics).toEqual(['biographies__01-polyester'])
    expect(opts.adminEmail).toBe(ADMIN)
    // subjectByComic is derived from useComics(): comicId → subject_slug.
    expect(opts.subjectByComic).toEqual({
      'biographies__01-polyester': 'dhirubhai-ambani',
      'biographies__01-master': 'sachin-tendulkar',
    })
  })

  it('removing a chip calls setGrants without that value', () => {
    allocData = {
      email: 'ankit@dpb.in',
      lines: ['biographies', 'awareness'],
      figures: [],
      comics: [],
      programs: [],
      figures_effective: [],
    }
    render(<AllocationsSection adminEmail={ADMIN} />)
    selectMember()

    fireEvent.click(screen.getByRole('button', { name: 'Remove line Awareness' }))
    expect(setGrants).toHaveBeenCalledTimes(1)
    const grants = setGrants.mock.calls[0][1]
    expect(grants.lines).toEqual(['biographies'])
  })

  it('a member with an empty allocation shows the "No works allocated" message', () => {
    allocData = {
      email: 'ankit@dpb.in', lines: [], figures: [], comics: [], programs: [], figures_effective: [],
    }
    render(<AllocationsSection adminEmail={ADMIN} />)
    selectMember()
    expect(screen.getByText(/no works allocated/i)).toBeInTheDocument()
  })

  it('an "Add" button is disabled when the selected target is already granted', () => {
    allocData = {
      email: 'ankit@dpb.in',
      lines: ['biographies'],
      figures: [],
      comics: [],
      programs: [],
      figures_effective: [],
    }
    render(<AllocationsSection adminEmail={ADMIN} />)
    selectMember()

    const addLineBtn = screen.getByRole('button', { name: 'Add line grant' })
    expect(addLineBtn).toBeDisabled()             // nothing selected yet
    fireEvent.change(screen.getByLabelText('Line to add'), { target: { value: 'biographies' } })
    expect(addLineBtn).toBeDisabled()             // already granted
    expect(screen.getByText(/already granted/i)).toBeInTheDocument()
  })
})

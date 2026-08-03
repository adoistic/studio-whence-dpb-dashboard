import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ── auth: admin user ──────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: { email: 'adnan@thothica.com' }, loading: false }),
  useAllowStatus: () => 'admin',
}))

// ── members ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/admin', () => ({
  useMembers: () => ({
    data: [
      { email: 'ankit@dpb.in', role: 'member' },
      { email: 'sa@dpb.in', role: 'sub_admin' },
    ],
    loading: false,
  }),
}))

// ── allocation lib: controllable useAllAllocations + spy setGrants + pure helpers ──

const { setGrants } = vi.hoisted(() => ({
  setGrants: vi.fn<
    (
      email: string,
      grants: { lines: string[]; figures: string[]; comics: string[]; programs: string[] },
      opts: { adminEmail: string; subjectByComic: Record<string, string | undefined> },
    ) => Promise<void>
  >(() => Promise.resolve()),
}))

type Grants = { lines: string[]; figures: string[]; comics: string[]; programs: string[] }
type Alloc = Grants & { email: string; figures_effective: string[] }

// The whole allocations collection, swapped per test before render.
let allocsData: Alloc[] = []

// The real allocation module imports @/lib/firebase (auth init blows up under
// jsdom), so the small pure add/remove helpers are reimplemented here to test
// real add/remove semantics without dragging in Firebase.
const listKey = (k: 'line' | 'figure' | 'comic' | 'program') =>
  (k === 'line' ? 'lines' : k === 'figure' ? 'figures'
    : k === 'comic' ? 'comics' : 'programs') as keyof Grants
const grantsOf = (a: Alloc): Grants =>
  ({ lines: [...a.lines], figures: [...a.figures], comics: [...a.comics], programs: [...a.programs] })

vi.mock('@/lib/allocation', () => ({
  useAllAllocations: () => ({ data: allocsData, loading: false }),
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

// ── catalog fixture ───────────────────────────────────────────────────────────

const LINES = [
  { slug: 'biographies', title: 'Biographies', subtitle: '', comics: [], figures: [] },
  { slug: 'awareness', title: 'Awareness', subtitle: '', comics: [], figures: [] },
]
const FIGURES = [
  { series: 'cricket', slug: 'sachin-tendulkar', sources_count: 1, words: 10 },
  { series: 'tech', slug: 'steve-jobs', sources_count: 1, words: 10 },
]
const COMICS = [
  { title: 'The Polyester Dream', line: 'biographies', slug: '01-polyester', status: 'approved', subject_slug: 'dhirubhai-ambani', series: 'Cricket Legends', program_slug: 'cricket-legends' },
  { title: 'Master Blaster', line: 'biographies', slug: '01-master', status: 'approved', subject_slug: 'sachin-tendulkar' },
]

vi.mock('@/lib/catalog', () => ({
  useLines: () => ({ data: LINES, loading: false }),
  useFigures: () => ({ data: FIGURES, loading: false }),
  useComics: () => ({ data: COMICS, loading: false }),
}))

import { AllocationsSection } from '@/components/admin/AllocationsSection'

const ADMIN = 'adnan@thothica.com'

const alloc = (email: string, over: Partial<Grants> = {}): Alloc => ({
  email, lines: [], figures: [], comics: [], programs: [], figures_effective: [],
  ...over,
})

function openEditor(email = 'ankit@dpb.in') {
  fireEvent.click(screen.getByLabelText(`Edit access for ${email}`))
}

beforeEach(() => {
  setGrants.mockClear()
  allocsData = []
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AllocationsSection (who sees what)', () => {
  it('lists every member with a plain-English summary of their access', () => {
    allocsData = [alloc('ankit@dpb.in', { lines: ['biographies'], comics: ['biographies__01-master'] })]
    render(<AllocationsSection adminEmail={ADMIN} />)
    expect(screen.getByText('ankit@dpb.in')).toBeInTheDocument()
    expect(screen.getByText(/Biographies \(line\) · Master Blaster/)).toBeInTheDocument()
  })

  it('marks a sub-admin as seeing everything, with no editor', () => {
    render(<AllocationsSection adminEmail={ADMIN} />)
    expect(screen.getByText('sa@dpb.in')).toBeInTheDocument()
    expect(screen.getByText('sub-admin · sees everything')).toBeInTheDocument()
    expect(screen.queryByLabelText('Edit access for sa@dpb.in')).not.toBeInTheDocument()
  })

  it('flags a member with no grants, so nobody wonders why they see a blank site', () => {
    render(<AllocationsSection adminEmail={ADMIN} />)
    expect(screen.getByText(/Nothing yet — this person sees no work/)).toBeInTheDocument()
  })

  it('also lists an allocation for an email that is not on the allowlist (domain user)', () => {
    allocsData = [alloc('someone@thothica.com', { lines: ['awareness'] })]
    render(<AllocationsSection adminEmail={ADMIN} />)
    expect(screen.getByText('someone@thothica.com')).toBeInTheDocument()
    expect(screen.getByText(/Awareness \(line\)/)).toBeInTheDocument()
  })

  it('granting a comic writes the full grant set with the comic appended + subject map', () => {
    allocsData = [alloc('ankit@dpb.in', { lines: ['biographies'] })]
    render(<AllocationsSection adminEmail={ADMIN} />)
    openEditor()
    fireEvent.change(screen.getByLabelText('What to grant'), { target: { value: 'comic' } })
    fireEvent.change(screen.getByLabelText('Which one'), { target: { value: 'biographies__01-master' } })
    fireEvent.click(screen.getByLabelText('Grant access'))

    expect(setGrants).toHaveBeenCalledTimes(1)
    const [email, grants, opts] = setGrants.mock.calls[0]
    expect(email).toBe('ankit@dpb.in')
    expect(grants.comics).toEqual(['biographies__01-master'])
    expect(grants.lines).toEqual(['biographies'])
    expect(opts.adminEmail).toBe(ADMIN)
    expect(opts.subjectByComic['biographies__01-master']).toBe('sachin-tendulkar')
  })

  it('removing a chip writes the grant set without that value', () => {
    allocsData = [alloc('ankit@dpb.in', { lines: ['biographies', 'awareness'] })]
    render(<AllocationsSection adminEmail={ADMIN} />)
    openEditor()
    fireEvent.click(screen.getByLabelText('Remove line Biographies'))

    expect(setGrants).toHaveBeenCalledTimes(1)
    const [, grants] = setGrants.mock.calls[0]
    expect(grants.lines).toEqual(['awareness'])
  })

  it('disables Grant when the chosen thing is already granted', () => {
    allocsData = [alloc('ankit@dpb.in', { lines: ['biographies'] })]
    render(<AllocationsSection adminEmail={ADMIN} />)
    openEditor()
    // kind defaults to 'line'
    fireEvent.change(screen.getByLabelText('Which one'), { target: { value: 'biographies' } })
    expect(screen.getByLabelText('Grant access')).toBeDisabled()
    expect(screen.getByText('Already granted.')).toBeInTheDocument()
  })

  it('shows each grant as a removable chip with its kind named', () => {
    allocsData = [alloc('ankit@dpb.in', {
      lines: ['biographies'], programs: ['cricket-legends'],
      figures: ['sachin-tendulkar'], comics: ['biographies__01-master'],
    })]
    render(<AllocationsSection adminEmail={ADMIN} />)
    openEditor()
    expect(screen.getByLabelText('Remove line Biographies')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove series Cricket Legends')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove figure Sachin Tendulkar')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove comic Master Blaster')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

// ── auth mock (toggle status per test) ───────────────────────────────────────────

let allowStatus = 'admin'
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: { email: 'adnan@thothica.com' }, loading: false }),
  useAllowStatus: () => allowStatus,
}))

// ── admin lib mock (hooks return fixed data; mutations are spies) ─────────────────

const {
  approveRequest, denyRequest, addMember, setMemberRole,
  removeMember, suspendEmail, reinstate,
} = vi.hoisted(() => ({
  approveRequest: vi.fn(() => Promise.resolve()),
  denyRequest: vi.fn(() => Promise.resolve()),
  addMember: vi.fn(() => Promise.resolve()),
  setMemberRole: vi.fn(() => Promise.resolve()),
  removeMember: vi.fn(() => Promise.resolve()),
  suspendEmail: vi.fn(() => Promise.resolve()),
  reinstate: vi.fn(() => Promise.resolve()),
}))

let pendingData: unknown[] = []
let membersData: unknown[] = []
let suspendedData: unknown[] = []

vi.mock('@/lib/admin', () => ({
  usePendingRequests: () => ({ data: pendingData, loading: false }),
  useMembers: () => ({ data: membersData, loading: false }),
  useSuspended: () => ({ data: suspendedData, loading: false }),
  approveRequest,
  denyRequest,
  addMember,
  setMemberRole,
  removeMember,
  suspendEmail,
  reinstate,
}))

// ── allocation + catalog mocks (AllocationsSection consumes these) ────────────────
// The AdminPanel suite doesn't exercise the allocations flow; these stubs just
// keep the section from hitting Firestore. The allocations flow is covered in
// AllocationsSection.test.tsx.

vi.mock('@/lib/allocation', () => ({
  useAllocation: () => ({ data: null, loading: false }),
  useAllAllocations: () => ({ data: [], loading: false }),
  setGrants: vi.fn(() => Promise.resolve()),
  addGrant: () => ({ lines: [], figures: [], comics: [] }),
  removeGrant: () => ({ lines: [], figures: [], comics: [] }),
}))

vi.mock('@/lib/catalog', () => ({
  useLines: () => ({ data: [], loading: false }),
  useFigures: () => ({ data: [], loading: false }),
  useComics: () => ({ data: [], loading: false }),
}))

// The panel now carries a pricing section. Stub the store (it reaches Firestore
// via firebase.ts, which needs a real API key at module load) but let the pure
// rate arithmetic run for real, so the section renders as it does in the app.
vi.mock('@/lib/pricing', async (orig) => ({
  ...(await orig<typeof import('@/lib/pricing')>()),
  usePricing: () => ({ data: null, loading: false }),
  setDefaultRate: vi.fn(() => Promise.resolve()),
  setLineRate: vi.fn(() => Promise.resolve()),
  setComicRate: vi.fn(() => Promise.resolve()),
  clearLineRate: vi.fn(() => Promise.resolve()),
  clearComicRate: vi.fn(() => Promise.resolve()),
  seedLineRates: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/lib/visibleCatalog', () => ({
  useVisibleComics: () => ({ data: [], loading: false }),
}))

import { AdminPanel } from '@/components/AdminPanel'

beforeEach(() => {
  allowStatus = 'admin'
  pendingData = []
  membersData = []
  suspendedData = []
  ;[approveRequest, denyRequest, addMember, setMemberRole, removeMember, suspendEmail, reinstate]
    .forEach((f) => f.mockClear())
})

// ── Gate ──────────────────────────────────────────────────────────────────────────

describe('AdminPanel gate', () => {
  it('non-admin (sub_admin) sees Not authorized and NO management controls', () => {
    allowStatus = 'sub_admin'
    pendingData = [{ email: 'p@x.com' }]
    render(<AdminPanel />)
    expect(screen.getByText(/not authorized/i)).toBeInTheDocument()
    expect(screen.queryByText(/access requests/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
  })

  it('plain member sees Not authorized', () => {
    allowStatus = 'allow'
    render(<AdminPanel />)
    expect(screen.getByText(/not authorized/i)).toBeInTheDocument()
  })

  it('loading shows a loading line, not the panel', () => {
    allowStatus = 'loading'
    render(<AdminPanel />)
    expect(screen.getByText(/loading…/i)).toBeInTheDocument()
    expect(screen.queryByText(/access & roles/i)).toBeNull()
  })

  it('admin sees the three sections + add form', () => {
    render(<AdminPanel />)
    expect(screen.getByRole('heading', { name: /access requests/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^members$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^suspended$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /add by email/i })).toBeInTheDocument()
  })
})

// ── Access requests ─────────────────────────────────────────────────────────────────

describe('AdminPanel access requests', () => {
  it('Approve calls approveRequest as member', () => {
    pendingData = [{ email: 'newperson@x.com' }]
    render(<AdminPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve newperson@x.com as member' }))
    expect(approveRequest).toHaveBeenCalledWith(
      'newperson@x.com',
      { asSubAdmin: false, adminEmail: 'adnan@thothica.com' },
    )
  })

  it('empty state when no requests', () => {
    render(<AdminPanel />)
    expect(screen.getByText(/no pending requests/i)).toBeInTheDocument()
  })

  it('Deny needs a second (confirm) click before denyRequest fires', () => {
    pendingData = [{ email: 'deny@x.com' }]
    render(<AdminPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Deny deny@x.com' }))
    expect(denyRequest).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deny deny@x.com' }))
    expect(denyRequest).toHaveBeenCalledWith('deny@x.com')
  })
})

// ── Members + two-step confirm ──────────────────────────────────────────────────────

describe('AdminPanel members', () => {
  it('removeMember requires the second confirm click', () => {
    membersData = [{ email: 'm@x.com', role: 'member' }]
    render(<AdminPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove m@x.com' }))
    expect(removeMember).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove m@x.com' }))
    expect(removeMember).toHaveBeenCalledWith('m@x.com')
  })

  it('suspendEmail requires the second confirm click', () => {
    membersData = [{ email: 'm@x.com', role: 'member' }]
    render(<AdminPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Suspend m@x.com' }))
    expect(suspendEmail).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm suspend m@x.com' }))
    expect(suspendEmail).toHaveBeenCalledWith('m@x.com', { adminEmail: 'adnan@thothica.com' })
  })

  it('toggling role: member shows Make sub-admin → setMemberRole', () => {
    membersData = [{ email: 'm@x.com', role: 'member' }]
    render(<AdminPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Make m@x.com a sub-admin' }))
    expect(setMemberRole).toHaveBeenCalledWith('m@x.com', 'sub_admin', { adminEmail: 'adnan@thothica.com' })
  })

  it('Cancel disarms the confirm without firing the mutation', () => {
    membersData = [{ email: 'm@x.com', role: 'member' }]
    render(<AdminPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove m@x.com' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(removeMember).not.toHaveBeenCalled()
    // The original Remove button is back.
    expect(screen.getByRole('button', { name: 'Remove m@x.com' })).toBeInTheDocument()
  })
})

// ── Suspended ───────────────────────────────────────────────────────────────────────

describe('AdminPanel suspended', () => {
  it('Reinstate calls reinstate', () => {
    suspendedData = [{ email: 's@x.com' }]
    render(<AdminPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Reinstate s@x.com' }))
    expect(reinstate).toHaveBeenCalledWith('s@x.com')
  })
})

// ── Add by email ────────────────────────────────────────────────────────────────────

describe('AdminPanel add by email', () => {
  it('rejects an invalid email with an inline error and does not call addMember', () => {
    render(<AdminPanel />)
    const input = screen.getByLabelText(/add a member by email/i)
    fireEvent.change(input, { target: { value: 'notanemail' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }))
    expect(addMember).not.toHaveBeenCalled()
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
  })

  it('valid email calls addMember and clears the field', () => {
    render(<AdminPanel />)
    const input = screen.getByLabelText(/add a member by email/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'good@x.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }))
    expect(addMember).toHaveBeenCalledWith('good@x.com', { asSubAdmin: false, adminEmail: 'adnan@thothica.com' })
    expect(input.value).toBe('')
  })

  it('Add sub-admin passes asSubAdmin true', () => {
    render(<AdminPanel />)
    fireEvent.change(screen.getByLabelText(/add a member by email/i), { target: { value: 'sa@x.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add sub-admin' }))
    expect(addMember).toHaveBeenCalledWith('sa@x.com', { asSubAdmin: true, adminEmail: 'adnan@thothica.com' })
  })

  it('Suspend-an-email form calls suspendEmail for a valid email', () => {
    render(<AdminPanel />)
    fireEvent.change(screen.getByLabelText(/suspend an email/i), { target: { value: 'dom@dpb.in' } })
    fireEvent.click(screen.getByRole('button', { name: 'Suspend email' }))
    expect(suspendEmail).toHaveBeenCalledWith('dom@dpb.in', { adminEmail: 'adnan@thothica.com' })
  })

  it('reinstate row and members coexist without id collisions', () => {
    membersData = [{ email: 'm@x.com', role: 'sub_admin' }]
    render(<AdminPanel />)
    // The email now also appears in the (mounted) Who-sees-what overview, so
    // anchor on the role button and walk up to its Members row.
    const btn = screen.getByRole('button', { name: 'Make m@x.com a member' })
    expect(within(btn.closest('li')!).getByText('m@x.com')).toBeInTheDocument()
  })
})

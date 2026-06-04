import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ── Firestore mock ────────────────────────────────────────────────────────────────
// doc()/collection() return tagged objects so we can assert the path the mutation
// targeted; the write fns are spies; serverTimestamp() returns a sentinel.

const mockSetDoc = vi.fn()
const mockUpdateDoc = vi.fn()
const mockDeleteDoc = vi.fn()
const mockGetDocs = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ __path: `${col}/${id}` }),
  collection: (_db: unknown, col: string) => ({ __col: col }),
  getDocs: (...a: unknown[]) => mockGetDocs(...a),
  setDoc: (...a: unknown[]) => mockSetDoc(...a),
  updateDoc: (...a: unknown[]) => mockUpdateDoc(...a),
  deleteDoc: (...a: unknown[]) => mockDeleteDoc(...a),
  serverTimestamp: () => '__ts__',
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))

import {
  normalizeEmail,
  usePendingRequests, useMembers, useSuspended,
  approveRequest, denyRequest, addMember, setMemberRole,
  removeMember, suspendEmail, reinstate,
} from '@/lib/admin'

beforeEach(() => {
  mockSetDoc.mockReset(); mockSetDoc.mockResolvedValue(undefined)
  mockUpdateDoc.mockReset(); mockUpdateDoc.mockResolvedValue(undefined)
  mockDeleteDoc.mockReset(); mockDeleteDoc.mockResolvedValue(undefined)
  mockGetDocs.mockReset()
})

const ADMIN = 'adnan@thothica.com'

// ── normalizeEmail ────────────────────────────────────────────────────────────────

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Foo.Bar@DPB.IN  ')).toBe('foo.bar@dpb.in')
  })
})

// ── mutations ─────────────────────────────────────────────────────────────────────

describe('approveRequest', () => {
  it('writes allowlist with lowercased id + member role, then marks the request resolved with raw id', async () => {
    await approveRequest('Foo@DPB.in', { asSubAdmin: false, adminEmail: ADMIN })

    expect(mockSetDoc).toHaveBeenCalledWith(
      { __path: 'allowlist/foo@dpb.in' },
      { role: 'member', added_by: ADMIN, added_at: '__ts__' },
    )
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { __path: 'access_requests/Foo@DPB.in' }, // raw id preserved
      { resolved: true, resolution: 'approved' },
    )
  })

  it('asSubAdmin writes sub_admin role + approved_sub_admin resolution', async () => {
    await approveRequest('x@y.com', { asSubAdmin: true, adminEmail: ADMIN })
    expect(mockSetDoc).toHaveBeenCalledWith(
      { __path: 'allowlist/x@y.com' },
      expect.objectContaining({ role: 'sub_admin' }),
    )
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { __path: 'access_requests/x@y.com' },
      { resolved: true, resolution: 'approved_sub_admin' },
    )
  })
})

describe('denyRequest', () => {
  it('marks request resolved + denied with raw id', async () => {
    await denyRequest('Raw@Case.com')
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { __path: 'access_requests/Raw@Case.com' },
      { resolved: true, resolution: 'denied' },
    )
  })
})

describe('addMember', () => {
  it('sets allowlist/{norm} with member role + stamps', async () => {
    await addMember('  New@Person.COM ', { asSubAdmin: false, adminEmail: ADMIN })
    expect(mockSetDoc).toHaveBeenCalledWith(
      { __path: 'allowlist/new@person.com' },
      { role: 'member', added_by: ADMIN, added_at: '__ts__' },
    )
  })
  it('asSubAdmin sets sub_admin role', async () => {
    await addMember('a@b.com', { asSubAdmin: true, adminEmail: ADMIN })
    expect(mockSetDoc).toHaveBeenCalledWith(
      { __path: 'allowlist/a@b.com' },
      expect.objectContaining({ role: 'sub_admin' }),
    )
  })
})

describe('setMemberRole', () => {
  it('updates role on allowlist/{norm}', async () => {
    await setMemberRole('A@B.com', 'sub_admin', { adminEmail: ADMIN })
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { __path: 'allowlist/a@b.com' },
      { role: 'sub_admin' },
    )
  })
})

describe('removeMember', () => {
  it('deletes allowlist/{norm}', async () => {
    await removeMember('Gone@X.com')
    expect(mockDeleteDoc).toHaveBeenCalledWith({ __path: 'allowlist/gone@x.com' })
  })
})

describe('suspendEmail', () => {
  it('sets suspended/{norm} with suspended_by + stamp', async () => {
    await suspendEmail('Bad@Actor.com', { adminEmail: ADMIN })
    expect(mockSetDoc).toHaveBeenCalledWith(
      { __path: 'suspended/bad@actor.com' },
      { suspended_by: ADMIN, suspended_at: '__ts__' },
    )
  })
})

describe('reinstate', () => {
  it('deletes suspended/{norm}', async () => {
    await reinstate('Back@In.com')
    expect(mockDeleteDoc).toHaveBeenCalledWith({ __path: 'suspended/back@in.com' })
  })
})

// ── hooks ─────────────────────────────────────────────────────────────────────────

describe('usePendingRequests', () => {
  it('maps doc.id→email and filters out resolved requests', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'a@x.com', data: () => ({ resolved: false, requested_at: 2 }) },
        { id: 'b@x.com', data: () => ({ resolved: true, resolution: 'approved' }) },
        { id: 'c@x.com', data: () => ({ requested_at: 5 }) }, // resolved absent → kept
      ],
    })
    const { result } = renderHook(() => usePendingRequests(0))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const emails = result.current.data!.map((r) => r.email)
    expect(emails).toEqual(['c@x.com', 'a@x.com']) // resolved filtered; sorted requested_at desc
  })
})

describe('useMembers', () => {
  it('maps doc.id→email, normalises role, sub_admins first', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'm@x.com', data: () => ({ role: 'member' }) },
        { id: 's@x.com', data: () => ({ role: 'sub_admin' }) },
        { id: 'z@x.com', data: () => ({}) }, // absent role → member
      ],
    })
    const { result } = renderHook(() => useMembers(0))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data!.map((m) => [m.email, m.role])).toEqual([
      ['s@x.com', 'sub_admin'],
      ['m@x.com', 'member'],
      ['z@x.com', 'member'],
    ])
  })
})

describe('useSuspended', () => {
  it('maps doc.id→email sorted by email', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'z@x.com', data: () => ({}) },
        { id: 'a@x.com', data: () => ({ suspended_by: ADMIN }) },
      ],
    })
    const { result } = renderHook(() => useSuspended(0))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data!.map((s) => s.email)).toEqual(['a@x.com', 'z@x.com'])
  })
})

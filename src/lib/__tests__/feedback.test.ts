import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: Record<string, unknown[]> = { addDoc: [], updateDoc: [], where: [], orderBy: [] }
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => ({ _c: a }),
  doc: (...a: unknown[]) => ({ _d: a }),
  query: (...a: unknown[]) => ({ _q: a }),
  where: (...a: unknown[]) => { calls.where.push(a); return { w: a } },
  orderBy: (...a: unknown[]) => { calls.orderBy.push(a); return { o: a } },
  onSnapshot: () => () => {},
  addDoc: (_c: unknown, data: unknown) => { calls.addDoc.push(data); return Promise.resolve({ id: 'new' }) },
  updateDoc: (_d: unknown, data: unknown) => { calls.updateDoc.push(data); return Promise.resolve() },
  deleteDoc: () => Promise.resolve(),
  serverTimestamp: () => 'TS',
}))

import { addComment, addReply, setStatus } from '@/lib/feedback'

beforeEach(() => { calls.addDoc = []; calls.updateDoc = [] })

describe('feedback actions', () => {
  const author = { email: 'a@b.com', name: 'A', role: 'allow' }
  it('addComment writes a root with own author, status open, hidden false', async () => {
    await addComment({ comicId: 'c', line: 'biographies', anchors: [], body: 'hi', comicVersion: 2 }, author)
    expect(calls.addDoc[0]).toMatchObject({
      comicId: 'c', parentId: null, authorEmail: 'a@b.com', status: 'open', hidden: false, comicVersion: 2,
    })
  })
  it('addReply writes parentId and no status', async () => {
    await addReply({ comicId: 'c', line: 'biographies', parentId: 'root1', body: 'r', comicVersion: 2 }, author)
    expect(calls.addDoc[0]).toMatchObject({ parentId: 'root1' })
    expect(calls.addDoc[0]).not.toHaveProperty('status')
  })
  it('setStatus updates only status', async () => {
    await setStatus('id1', 'resolved')
    expect(calls.updateDoc[0]).toMatchObject({ status: 'resolved' })
  })
})

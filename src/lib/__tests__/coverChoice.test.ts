import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Record<string, unknown[]> = { setDoc: [] }

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => ({ _d: a }),
  onSnapshot: () => () => {},
  setDoc: (_d: unknown, data: unknown) => {
    calls.setDoc.push(data)
    return Promise.resolve()
  },
  serverTimestamp: () => 'TS',
}))

const up = vi.hoisted(() => ({
  uploadCoverRef: vi.fn(async () => 'artifacts/comics/legacy/x/cover-refs/ref.png'),
}))
vi.mock('@/lib/dataApi', () => ({ uploadCoverRef: up.uploadCoverRef }))

import { setOptionAsOfficial, uploadOfficialCover } from '@/lib/coverChoice'

beforeEach(() => {
  calls.setDoc = []
  up.uploadCoverRef.mockClear()
})

describe('coverChoice', () => {
  const author = { email: 'a@b.com', name: 'A' }

  it('setOptionAsOfficial writes an option choice', async () => {
    await setOptionAsOfficial(
      'legacy__x',
      { key: 'artifacts/comics/legacy/x/cover-options/opt2.png', label: 'Option 2' },
      author,
    )
    expect(calls.setDoc[0]).toMatchObject({
      source: 'option',
      key: 'artifacts/comics/legacy/x/cover-options/opt2.png',
      label: 'Option 2',
      setByEmail: 'a@b.com',
      setByName: 'A',
    })
  })

  it('uploadOfficialCover uploads then writes an upload choice', async () => {
    await uploadOfficialCover(
      'legacy__x',
      { line: 'legacy', slug: 'x' },
      { name: 'ref.png', type: 'image/png' } as File,
      author,
    )
    expect(up.uploadCoverRef).toHaveBeenCalledWith('legacy', 'x', expect.anything())
    expect(calls.setDoc[0]).toMatchObject({
      source: 'upload',
      key: 'artifacts/comics/legacy/x/cover-refs/ref.png',
      label: 'ref.png',
    })
  })
})

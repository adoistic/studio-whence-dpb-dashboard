import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  presignPut: vi.fn(async () => 'https://signed.put/x'),
}))
vi.mock('../auth', () => ({ authorize: h.authorize }))
// putObject/deleteObject: ideasTrigger (re-exported by index.ts) imports them at module level.
vi.mock('../r2', () => ({ presignGet: vi.fn(), getObject: vi.fn(), presignPut: h.presignPut, putObject: vi.fn(), deleteObject: vi.fn() }))
vi.mock('../allocation', () => ({ getAllocation: vi.fn(), isKeyAllowedForMember: vi.fn() }))
// ideaStore + the firestore trigger: ideasTrigger / the /idea-capture route
// (re-exported by index.ts) load them at module level — stub for hermeticity.
vi.mock('../ideaStore', () => ({
  getIdeaData: vi.fn(), getCaptureData: vi.fn(), createCapture: vi.fn(),
  markCaptured: vi.fn(), markFailed: vi.fn(), listCaptureIds: vi.fn(), deleteCaptureDoc: vi.fn(),
}))
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentWritten: () => undefined }))
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (arg1: unknown, arg2?: unknown) =>
    typeof arg1 === 'function' ? arg1 : arg2,
}))

import { dataApi } from '../index'

function res() {
  const r: any = {}
  r.set = vi.fn(() => r); r.status = vi.fn(() => r); r.json = vi.fn(() => r)
  r.type = vi.fn(() => r); r.send = vi.fn(() => r); r.get = vi.fn()
  return r
}
function req(body: any) {
  return { method: 'POST', path: '/upload-url', body, get: vi.fn(), headers: {} } as any
}

describe('POST /upload-url', () => {
  beforeEach(() => { h.authorize.mockReset(); h.presignPut.mockClear() })
  it('403 for non-moderator', async () => {
    h.authorize.mockResolvedValue({ email: 'm@dpb.in', moderator: false })
    const r = res(); await (dataApi as any)(req({ ideaId: 'i', filename: 'p.png', contentType: 'image/png' }), r)
    expect(r.status).toHaveBeenCalledWith(403)
  })
  it('400 for non-image content type', async () => {
    h.authorize.mockResolvedValue({ email: 'a@thothica.com', moderator: true })
    const r = res(); await (dataApi as any)(req({ ideaId: 'i', filename: 'p.txt', contentType: 'text/plain' }), r)
    expect(r.status).toHaveBeenCalledWith(400)
  })
  it('200 with url+key for a moderator', async () => {
    h.authorize.mockResolvedValue({ email: 'a@thothica.com', moderator: true })
    const r = res(); await (dataApi as any)(req({ ideaId: 'i1', filename: 'p.png', contentType: 'image/png' }), r)
    expect(r.status).toHaveBeenCalledWith(200)
    expect(r.json).toHaveBeenCalledWith({ url: 'https://signed.put/x', key: 'images/ideas/i1/p.png' })
  })
  it('200 with a cover-ref key for a moderator', async () => {
    h.authorize.mockResolvedValue({ email: 'a@thothica.com', moderator: true })
    const r = res()
    await (dataApi as any)(req({
      coverRef: { line: 'legacy', slug: 'hanuman-celestial-superpower' },
      filename: 'ref.png',
      contentType: 'image/png',
    }), r)
    expect(r.status).toHaveBeenCalledWith(200)
    expect(r.json).toHaveBeenCalledWith({
      url: 'https://signed.put/x',
      key: expect.stringMatching(
        /^artifacts\/comics\/legacy\/hanuman-celestial-superpower\/cover-refs\/ref-[a-zA-Z0-9_-]+\.png$/,
      ),
    })
  })
  it('403 for a cover-ref with a bad slug', async () => {
    h.authorize.mockResolvedValue({ email: 'a@thothica.com', moderator: true })
    const r = res()
    await (dataApi as any)(req({
      coverRef: { line: 'legacy', slug: 'bad slug' },
      filename: 'ref.png',
      contentType: 'image/png',
    }), r)
    expect(r.status).toHaveBeenCalledWith(403)
  })
  it('403 for a non-moderator cover-ref upload', async () => {
    h.authorize.mockResolvedValue({ email: 'm@dpb.in', moderator: false })
    const r = res()
    await (dataApi as any)(req({
      coverRef: { line: 'legacy', slug: 'x' },
      filename: 'ref.png',
      contentType: 'image/png',
    }), r)
    expect(r.status).toHaveBeenCalledWith(403)
  })
})

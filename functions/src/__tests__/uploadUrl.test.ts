import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  presignPut: vi.fn(async () => 'https://signed.put/x'),
}))
vi.mock('../auth', () => ({ authorize: h.authorize }))
vi.mock('../r2', () => ({ presignGet: vi.fn(), getObject: vi.fn(), presignPut: h.presignPut }))
vi.mock('../allocation', () => ({ getAllocation: vi.fn(), isKeyAllowedForMember: vi.fn() }))
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
})

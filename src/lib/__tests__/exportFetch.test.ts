import { describe, it, expect } from 'vitest'
import { exportImagePlan, fetchExportImages } from '@/lib/exportFetch'
import type { Comic } from '@/types/content'

const comic = {
  title: 'Test Comic', line: 'biographies', slug: 'test-comic', status: 'approved', subject_slug: null,
  pages: { hasPages: true, count: 2, coverKey: 'images/comics/biographies/test-comic/cover.jpg' },
} as unknown as Comic

const px = new Uint8Array([0xff, 0xd8, 0xff])
const measure = async () => ({ width: 100, height: 150 })

describe('exportImagePlan', () => {
  it('pairs each ref with web + master keys, cover first', () => {
    const plan = exportImagePlan(comic)
    expect(plan[0]).toEqual({
      ref: 'cover',
      webKey: 'images/comics/biographies/test-comic/web/cover.jpg',
      masterKey: 'images/comics/biographies/test-comic/cover.jpg',
    })
    expect(plan[1]).toEqual({
      ref: 1,
      webKey: 'images/comics/biographies/test-comic/pages/web/page-01.jpg',
      masterKey: 'images/comics/biographies/test-comic/pages/page-01.jpg',
    })
    expect(plan).toHaveLength(3)
  })
})

describe('fetchExportImages', () => {
  it('fetches web variants when available', async () => {
    const resolve = async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, `https://x/${k}`]))
    const fetchBytes = async (url: string) => (url.includes('/web/') ? px : null)
    const r = await fetchExportImages(comic, { resolve, fetchBytes, measure })
    expect(r.failed).toEqual([])
    expect(r.images.get('cover')).toEqual({ bytes: px, width: 100, height: 150 })
    expect(r.images.get(2)).toBeTruthy()
  })

  it('falls back to the master when the web variant is missing', async () => {
    const resolve = async (keys: string[]) => Object.fromEntries(keys.filter((k) => !k.includes('/web/')).map((k) => [k, `https://x/${k}`]))
    const fetchBytes = async () => px
    const r = await fetchExportImages(comic, { resolve, fetchBytes, measure })
    expect(r.failed).toEqual([])
    expect(r.images.size).toBe(3)
  })

  it('reports pages whose web AND master fetches fail, without throwing', async () => {
    const resolve = async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, `https://x/${k}`]))
    const fetchBytes = async (url: string) => (url.includes('page-02') ? null : px)
    const r = await fetchExportImages(comic, { resolve, fetchBytes, measure })
    expect(r.failed).toEqual([2])
    expect(r.images.has(2)).toBe(false)
    expect(r.images.size).toBe(2)
  })
})

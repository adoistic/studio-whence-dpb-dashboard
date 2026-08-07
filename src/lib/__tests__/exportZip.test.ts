import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { buildComicJson, buildReadme, buildExportZip, type ImageMap } from '@/lib/exportZip'
import { buildExportModel, type ExportOptions } from '@/lib/exportModel'
import type { Comic } from '@/types/content'

const OPTS: ExportOptions = { includeComments: true, includeScript: true, includeResolved: false }
const comic = {
  title: 'Test Comic', line: 'biographies', slug: 'test-comic', status: 'approved', subject_slug: null,
  pages: { hasPages: true, count: 2, coverKey: 'images/comics/biographies/test-comic/cover.jpg' },
} as unknown as Comic

const model = buildExportModel({ comic, threads: [], draftPages: [{ number: '1', panels: [] }], options: OPTS })
const px = new Uint8Array([0xff, 0xd8, 0xff, 0x00])
const images: ImageMap = new Map([
  ['cover', { bytes: px, width: 10, height: 15 }],
  [1, { bytes: px, width: 10, height: 15 }],
  [2, { bytes: px, width: 10, height: 15 }],
])

describe('buildComicJson', () => {
  it('is schema-versioned and mirrors the model', () => {
    const j = JSON.parse(buildComicJson(model))
    expect(j.schemaVersion).toBe('1.0')
    expect(typeof j.exportedAt).toBe('string')
    expect(j.comic).toEqual({ line: 'biographies', slug: 'test-comic', title: 'Test Comic' })
    expect(j.options).toEqual(OPTS)
    expect(j.hasScript).toBe(true)
    expect(j.pages).toHaveLength(2)
    expect(j.pages[0].image).toBe('pages/page-01.jpg')
    expect(j.generalComments).toEqual([])
  })
})

describe('buildReadme', () => {
  it('names the comic and explains refs + snapshot', () => {
    const r = buildReadme(model)
    expect(r).toContain('Test Comic')
    expect(r).toContain('comic.json')
    expect(r).toContain('pages/page-01.jpg')
    expect(r).toContain('snapshot')
  })
})

describe('buildExportZip', () => {
  it('manifest matches comic.json refs exactly', async () => {
    const zipBytes = await buildExportZip(model, images)
    const zip = await JSZip.loadAsync(zipBytes)
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort()
    expect(names).toEqual(['README.md', 'comic.json', 'cover.jpg', 'pages/page-01.jpg', 'pages/page-02.jpg'])
  })

  it('omits missing images from the zip without failing', async () => {
    const partial: ImageMap = new Map([[1, { bytes: px, width: 10, height: 15 }]])
    const zip = await JSZip.loadAsync(await buildExportZip(model, partial))
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort()
    expect(names).toEqual(['README.md', 'comic.json', 'pages/page-01.jpg'])
  })
})

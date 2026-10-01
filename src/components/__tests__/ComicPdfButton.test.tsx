import { describe, expect, test, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'

// buildComicPdf is pure (no DOM, no network), but the module also wires up the
// ComicPdfButton component which imports the gated dataApi → firebase. Mock
// dataApi so importing the module never initializes the real firebase singleton.
vi.mock('@/lib/dataApi', () => ({ resolveUrls: vi.fn() }))

import { buildComicPdf, pdfPageSizes } from '@/components/ComicPdfButton'

const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const TINY_PNG = Uint8Array.from(atob(TINY_PNG_B64), (c) => c.charCodeAt(0))

describe('buildComicPdf', () => {
  test('produces one PDF page per image', async () => {
    const pdf = await buildComicPdf([
      { bytes: TINY_PNG, type: 'image/png' },
      { bytes: TINY_PNG, type: 'image/png' },
    ])
    const parsed = await PDFDocument.load(pdf)
    expect(parsed.getPageCount()).toBe(2)
  })

  // Pages are uploaded under `.jpg` keys, but a re-encode that preserved PNG
  // bytes (or a wrong content-type from R2) would feed PNG bytes to embedJpg and
  // throw. The format must be sniffed from the bytes, not the content-type.
  test('embeds PNG bytes even when the content-type says JPEG', async () => {
    const pdf = await buildComicPdf([
      { bytes: TINY_PNG, type: 'image/jpeg' },
    ])
    const parsed = await PDFDocument.load(pdf)
    expect(parsed.getPageCount()).toBe(1)
  })
})

describe('pdfPageSizes', () => {
  test('a same-shaped plate at another resolution gets the interior size exactly', () => {
    // Inside covers rendered at 2016x2822 beside 1429x2000 pages (Diamond, 30 Sep
    // 2026: one approved size throughout).
    const dims = [
      { width: 1429, height: 2000 }, { width: 2016, height: 2822 },
      { width: 1429, height: 2000 }, { width: 1429, height: 2000 }, { width: 2016, height: 2822 },
    ]
    expect(pdfPageSizes(dims)).toEqual(Array(5).fill([1429, 2000]))
  })
  test('a differently shaped plate keeps its shape at the interior height', () => {
    expect(pdfPageSizes([
      { width: 1389, height: 2000 }, { width: 1429, height: 2000 }, { width: 1429, height: 2000 },
      { width: 2016, height: 2903 },
    ])).toEqual([[1389, 2000], [1429, 2000], [1429, 2000], [2016 * 2000 / 2903, 2000]])
  })
  test('empty in, empty out', () => {
    expect(pdfPageSizes([])).toEqual([])
  })
})

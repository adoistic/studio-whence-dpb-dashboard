import { describe, expect, test, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'

// buildComicPdf is pure (no DOM, no network), but the module also wires up the
// ComicPdfButton component which imports the gated dataApi → firebase. Mock
// dataApi so importing the module never initializes the real firebase singleton.
vi.mock('@/lib/dataApi', () => ({ resolveUrls: vi.fn() }))

import { buildComicPdf } from '@/components/ComicPdfButton'

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
})

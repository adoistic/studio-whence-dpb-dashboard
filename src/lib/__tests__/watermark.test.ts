import { describe, test, expect } from 'vitest'
import {
  scaleToFit, tilePositions, watermarkMetrics, previewImageMap,
  PREVIEW_MAX_EDGE, WATERMARK_TEXT,
} from '@/lib/watermark'

describe('scaleToFit', () => {
  test('shrinks a large page to the cap, preserving aspect ratio', () => {
    expect(scaleToFit(2016, 2688, 1000)).toEqual({ width: 750, height: 1000 })
    expect(scaleToFit(2016, 2688, 800)).toEqual({ width: 600, height: 800 })
  })

  test('caps the LONG edge whichever way the page is oriented', () => {
    expect(scaleToFit(2688, 2016, 1000)).toEqual({ width: 1000, height: 750 })
  })

  test('never upscales — a preview must not inflate a small page', () => {
    expect(scaleToFit(400, 500, 1000)).toEqual({ width: 400, height: 500 })
  })

  test('a page exactly at the cap is untouched', () => {
    expect(scaleToFit(1000, 750, 1000)).toEqual({ width: 1000, height: 750 })
  })

  test('a zero-sized image does not divide by zero', () => {
    expect(scaleToFit(0, 0, 1000)).toEqual({ width: 0, height: 0 })
  })

  test('the default cap is well below print resolution', () => {
    expect(PREVIEW_MAX_EDGE).toBeLessThanOrEqual(1200)
  })
})

describe('tilePositions', () => {
  test('covers beyond the page bounds so rotation leaves no bare corner', () => {
    const pts = tilePositions(750, 1000, 100, 100)
    const reach = Math.hypot(750, 1000) // 1250
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThanOrEqual(-reach + 100)
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThanOrEqual(reach - 100)
  })

  test('alternate rows are staggered, so no clean vertical lane runs through', () => {
    // Coverage, not symmetry, is the requirement: an unstaggered grid leaves
    // straight lanes between the columns of marks.
    const pts = tilePositions(600, 600, 200, 200)
    const rowY = [...new Set(pts.map((p) => p.y))].sort((a, b) => a - b)
    const xsAt = (y: number) => pts.filter((p) => p.y === y).map((p) => p.x).sort((a, b) => a - b)
    expect(xsAt(rowY[0])[0]).not.toBe(xsAt(rowY[1])[0])
  })

  test('the grid still reaches past the page in every direction', () => {
    const pts = tilePositions(600, 800, 100, 100)
    const reach = Math.hypot(600, 800)
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThanOrEqual(-reach + 100)
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThanOrEqual(reach - 100)
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThanOrEqual(-reach + 100)
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThanOrEqual(reach - 100)
  })

  test('a tighter step yields more marks', () => {
    const loose = tilePositions(750, 1000, 300, 300).length
    const tight = tilePositions(750, 1000, 100, 100).length
    expect(tight).toBeGreaterThan(loose)
  })

  test('a non-positive step yields nothing rather than looping forever', () => {
    expect(tilePositions(750, 1000, 0, 100)).toEqual([])
    expect(tilePositions(750, 1000, 100, -5)).toEqual([])
  })
})

describe('watermarkMetrics', () => {
  test('scales the mark with the page', () => {
    const small = watermarkMetrics(400, 500)
    const large = watermarkMetrics(1000, 1400)
    expect(large.fontPx).toBeGreaterThan(small.fontPx)
    expect(large.stepX).toBeGreaterThan(small.stepX)
  })

  test('keeps a floor so a tiny page is still marked', () => {
    expect(watermarkMetrics(60, 80).fontPx).toBeGreaterThanOrEqual(9)
  })

  test('the mark stays small and dense, not big and sparse', () => {
    // A 3x-larger mark was shipped and reverted: it left wide clean areas and
    // read as clumsy over the art.
    const m = watermarkMetrics(600, 800)
    expect(m.fontPx).toBeLessThanOrEqual(12)
    expect(Math.floor(600 / m.stepX)).toBeGreaterThanOrEqual(7)
    expect(Math.floor(800 / m.stepY)).toBeGreaterThanOrEqual(35)
  })

  test('marks never collide: the horizontal step clears the text width', () => {
    // "© Diamond Toons" runs about 7.2x the font size. A step at 7.5x left them
    // all but touching, which is the crowding this spacing exists to avoid.
    const m = watermarkMetrics(600, 800)
    const approxTextWidth = m.fontPx * 7.2
    expect(m.stepX).toBeGreaterThan(approxTextWidth)
  })

  test('marks are spaced further apart horizontally than vertically', () => {
    // The text is far wider than it is tall; equal steps would overlap badly.
    const m = watermarkMetrics(750, 1000)
    expect(m.stepX).toBeGreaterThan(m.stepY)
  })
})

describe('the mark itself', () => {
  test('is the Diamond Toons credit', () => {
    expect(WATERMARK_TEXT).toBe('© Diamond Toons')
  })
})

describe('previewImageMap — resolution and the mark are independent', () => {
  // No real canvas in jsdom, so previewPageJpeg always throws here. That makes
  // this an honest test of the FAILURE policy, which differs by intent.
  const one = () => new Map([[1, { bytes: new Uint8Array([1, 2, 3]), width: 2016, height: 2688 }]])

  test('a page that cannot be STAMPED is dropped, never shipped unmarked', async () => {
    const out = await previewImageMap(one(), { watermark: true })
    expect(out.size).toBe(0)
  })

  test('a page that cannot be downscaled is kept — nothing leaks by keeping it', async () => {
    const out = await previewImageMap(one(), { watermark: false })
    expect(out.size).toBe(1)
    expect(out.get(1)!.bytes).toEqual(new Uint8Array([1, 2, 3]))
  })

  test('an empty map stays empty either way', async () => {
    expect((await previewImageMap(new Map(), { watermark: true })).size).toBe(0)
    expect((await previewImageMap(new Map(), { watermark: false })).size).toBe(0)
  })
})

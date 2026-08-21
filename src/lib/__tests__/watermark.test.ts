import { describe, test, expect } from 'vitest'
import {
  scaleToFit, tilePositions, watermarkMetrics,
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

  test('the grid is symmetric about the origin', () => {
    const pts = tilePositions(600, 600, 200, 200)
    const xs = pts.map((p) => p.x)
    expect(Math.abs(Math.min(...xs))).toBeCloseTo(Math.max(...xs), 5)
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

  test('keeps a floor so a tiny page is still legibly marked', () => {
    // Below ~12px the mark stops reading as words and becomes speckle.
    expect(watermarkMetrics(60, 80).fontPx).toBeGreaterThanOrEqual(18)
  })

  test('the mark is large enough to read on a preview page', () => {
    // 600x800 is a preview page at the current cap; the mark should be a
    // comfortably readable size on it, not a fleck.
    expect(watermarkMetrics(600, 800).fontPx).toBeGreaterThanOrEqual(28)
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

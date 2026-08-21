'use client'

/**
 * Watermarked, low-resolution preview pages.
 *
 * Diamond needs a copy of a comic they can circulate — to a printer, a partner,
 * a reviewer — without handing over print-quality art. This builds that copy in
 * the BROWSER, from the pages the reader has already fetched: no pipeline step,
 * no new R2 keys, nothing to re-publish.
 *
 * The mark is repeated text (`© Diamond Toons`) on a diagonal grid rather than
 * a logo image, so it needs no asset, scales with the page, and cannot be
 * cropped off the way a single corner mark can.
 *
 * The geometry below is pure and unit-tested. The canvas drawing is deliberately
 * thin — jsdom has no real canvas, so the rendering itself is verified by eye
 * rather than pretended-to-be-tested.
 */

/** Long edge of a preview page, in pixels. Sourced from the 1200px web variants,
 *  so this only ever shrinks. Small enough to be unusable for print, large
 *  enough that the lettering stays readable on screen. */
export const PREVIEW_MAX_EDGE = 1000

/** JPEG quality for a preview page. */
export const PREVIEW_QUALITY = 0.7

/** The mark itself. */
export const WATERMARK_TEXT = '© Diamond Toons'

/** Anticlockwise tilt of the mark, in degrees. */
export const WATERMARK_ANGLE_DEG = -30

/** Ink, at the opacity that keeps the art readable underneath.
 *  Calibrated by rendering real pages: below ~0.3 the mark survives only over
 *  pale areas and vanishes across the coloured art, which is exactly where a
 *  preview copy needs to be marked. */
export const WATERMARK_FILL = 'rgba(80, 80, 80, 0.42)'

export interface Size {
  width: number
  height: number
}

/**
 * Fit a page inside `maxLongEdge`, preserving aspect ratio. An image already
 * smaller than the cap is returned unchanged — a preview must never UPSCALE,
 * which would inflate the file while adding no detail.
 */
export function scaleToFit(width: number, height: number, maxLongEdge: number): Size {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxLongEdge || longEdge === 0) {
    return { width: Math.round(width), height: Math.round(height) }
  }
  const k = maxLongEdge / longEdge
  return { width: Math.round(width * k), height: Math.round(height * k) }
}

/**
 * Grid points for the tiled mark, in the ROTATED frame.
 *
 * Because the text is drawn on a rotated canvas, a grid that merely spanned the
 * page would leave the corners bare once turned. The grid therefore covers a
 * square of side `2 * diagonal` centred on the page, which contains the page at
 * any rotation — the cost is a few off-canvas draws, and the benefit is that no
 * corner is ever left clean for a crop.
 */
export function tilePositions(
  width: number, height: number, stepX: number, stepY: number,
): { x: number; y: number }[] {
  if (stepX <= 0 || stepY <= 0) return []
  const reach = Math.hypot(width, height)
  // Step in integer multiples out from the centre, so the grid is exactly
  // symmetric about the origin. Walking `-reach` upward by `step` leaves the
  // far edge wherever the last step happens to land, which drifts the whole
  // pattern off-centre by up to one step.
  const cols = Math.ceil(reach / stepX)
  const rows = Math.ceil(reach / stepY)
  const points: { x: number; y: number }[] = []
  for (let j = -rows; j <= rows; j++) {
    for (let i = -cols; i <= cols; i++) {
      points.push({ x: i * stepX, y: j * stepY })
    }
  }
  return points
}

/** Mark size scaled to the page, so a small page is not covered by huge text
 *  and a large one is not covered by specks. */
export function watermarkMetrics(width: number, height: number): {
  fontPx: number; stepX: number; stepY: number
} {
  const base = Math.min(width, height)
  const fontPx = Math.max(11, Math.round(base * 0.018))
  return {
    fontPx,
    // Horizontal spacing keyed to the text's own length; vertical to its height.
    // These give roughly 8 marks across and 19 down on a 750x1000 page — dense
    // enough that no crop of a page comes away clean.
    stepX: Math.round(fontPx * 7.5),
    stepY: Math.round(fontPx * 4.2),
  }
}

/**
 * Draw the tiled mark over a canvas context that already holds the page.
 * Exported so the geometry and the drawing can be reasoned about separately.
 */
export function paintWatermark(
  ctx: CanvasRenderingContext2D, width: number, height: number,
): void {
  const { fontPx, stepX, stepY } = watermarkMetrics(width, height)
  ctx.save()
  ctx.fillStyle = WATERMARK_FILL
  ctx.font = `600 ${fontPx}px "Helvetica Neue", Helvetica, Arial, sans-serif`
  ctx.textBaseline = 'middle'
  // Rotate about the page centre so the grid is symmetric about it.
  ctx.translate(width / 2, height / 2)
  ctx.rotate((WATERMARK_ANGLE_DEG * Math.PI) / 180)
  for (const { x, y } of tilePositions(width, height, stepX, stepY)) {
    ctx.fillText(WATERMARK_TEXT, x, y)
  }
  ctx.restore()
}

/** Decode bytes to an ImageBitmap-like drawable. Split out so the pipeline
 *  below reads as one flow. */
async function decode(bytes: Uint8Array, type: string): Promise<ImageBitmap> {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return createImageBitmap(new Blob([copy], { type }))
}

/**
 * One page → a downscaled, watermarked JPEG.
 *
 * Throws if the browser cannot give us a 2D context; the caller reports that
 * rather than silently handing back an unwatermarked page, which would be the
 * worst possible failure for this feature.
 */
export async function watermarkedPageJpeg(
  bytes: Uint8Array,
  type = 'image/jpeg',
  maxEdge = PREVIEW_MAX_EDGE,
): Promise<Uint8Array> {
  const bitmap = await decode(bytes, type)
  const { width, height } = scaleToFit(bitmap.width, bitmap.height, maxEdge)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('watermark: no 2d canvas context')

  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  paintWatermark(ctx, width, height)

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', PREVIEW_QUALITY),
  )
  if (!blob) throw new Error('watermark: canvas produced no image')
  return new Uint8Array(await blob.arrayBuffer())
}


/**
 * Stamp every image in a fetched-image map, in place of the originals.
 *
 * Used by the export bundle so its pages carry the same mark as the preview
 * PDF. Sequential by design: a 64-page book stamped in parallel would hold
 * every decoded bitmap and canvas in memory at once.
 *
 * A page that fails to stamp is DROPPED rather than passed through unmarked —
 * silently shipping one clean page inside a watermarked bundle would defeat the
 * point of the bundle.
 */
export async function watermarkImageMap<K>(
  images: Map<K, { bytes: Uint8Array; width: number; height: number }>,
): Promise<Map<K, { bytes: Uint8Array; width: number; height: number }>> {
  const out = new Map<K, { bytes: Uint8Array; width: number; height: number }>()
  for (const [ref, img] of images) {
    try {
      const bytes = await watermarkedPageJpeg(img.bytes)
      const { width, height } = scaleToFit(img.width, img.height, PREVIEW_MAX_EDGE)
      out.set(ref, { bytes, width, height })
    } catch {
      // dropped on purpose — see the note above
    }
  }
  return out
}

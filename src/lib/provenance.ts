import type { Content } from '@/types/content'

export interface Citation {
  sourceTitle: string
  fileTitle: string
}

/** Map every research file path → its human source + file title, for instant
 * (synchronous) citation lookup on hover. Keyed by the bare repo path, which is
 * exactly what a marker's data-key carries. */
export function buildCitationMap(content: Content | null): Map<string, Citation> {
  const map = new Map<string, Citation>()
  if (!content) return map
  for (const line of content.lines) {
    for (const fig of line.figures ?? []) {
      for (const src of fig.sources ?? []) {
        for (const f of src.files ?? []) {
          map.set(f.path, { sourceTitle: src.title, fileTitle: f.title })
        }
      }
    }
  }
  return map
}

/** Slice ±ctx lines around a 1-based source line. citedIndex is the cited line's
 * position within the returned slice, or -1 if `line` is out of file bounds. */
export function sliceExcerpt(
  text: string,
  line: number,
  ctx = 2,
): { lines: string[]; citedIndex: number } {
  const all = text.split('\n')
  const idx = line - 1
  const clamped = Math.max(0, Math.min(idx, all.length - 1))
  const lo = Math.max(0, clamped - ctx)
  const hi = Math.min(all.length, clamped + ctx + 1)
  const lines = all.slice(lo, hi)
  const citedIndex = idx >= 0 && idx < all.length ? idx - lo : -1
  return { lines, citedIndex }
}

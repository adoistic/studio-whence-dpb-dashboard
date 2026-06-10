// Pure helpers tying the comic READER (rendered page images) to the feedback
// anchor model. Reader frame i shows the cover (when present) at i=0 and
// page N at the following indices; script pages and rendered pages share the
// same numbering, so a reader comment lands on the SAME `pN` anchor the draft
// view uses — one comment, visible in both surfaces.

import type { Anchor } from '@/lib/feedbackTypes'
import type { Thread } from '@/lib/feedbackTypes'

/** Script-page number shown at reader frame `index`, or null for the cover. */
export function readerPageNumber(hasCover: boolean, index: number): number | null {
  if (hasCover) return index === 0 ? null : index
  return index + 1
}

/** The canonical page anchor for a reader comment on page N. */
export function pageAnchor(page: number): Anchor {
  return { kind: 'page', ref: `p${page}`, page, snapshot: `Page ${page}` }
}

/** Threads that touch page N via ANY anchor (page, panel or beat). */
export function threadsForPage(threads: Thread[], page: number): Thread[] {
  return threads.filter((t) => t.root.anchors.some((a) => a.page === page))
}

/** page → thread count, for the reader's per-page comment badges. */
export function countThreadsByPage(threads: Thread[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const t of threads) {
    const pages = new Set(t.root.anchors.map((a) => a.page))
    for (const p of pages) m.set(p, (m.get(p) ?? 0) + 1)
  }
  return m
}

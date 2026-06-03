import type { Thread } from '@/lib/feedbackTypes'

export interface Badge { num: number; refs: string[] }

// Number anchored threads in gutter order; map threadId -> {num, all its beatRefs}.
export function assignBadges(threads: Thread[]): Map<string, Badge> {
  const m = new Map<string, Badge>()
  let n = 0
  for (const t of threads) {
    if (t.root.anchors.length) {
      n += 1
      m.set(t.root.id, { num: n, refs: t.root.anchors.map((a) => a.beatRef) })
    }
  }
  return m
}

// Pure types + helpers for feedback. No Firestore imports — unit-testable.

export type Status = 'open' | 'in_progress' | 'resolved' | 'deferred' | 'wont_fix'

export interface Anchor {
  beatRef: string
  page: number
  panel: number
  snapshot: string
}

export interface FeedbackNode {
  id: string
  comicId: string
  line: string
  parentId: string | null
  anchors: Anchor[]
  authorEmail: string
  authorName: string
  authorRole: string
  body: string
  status?: Status
  comicVersion: number
  hidden: boolean
  createdAt: unknown
  updatedAt?: unknown
  editedAt?: unknown | null
}

export interface Thread {
  root: FeedbackNode
  replies: FeedbackNode[]
}

export interface VersionEntry {
  version: number
  changedBeatRefs?: string[]
}

/** Normalise any timestamp-like value (Firestore Timestamp, ISO string, ms number) to ms. */
export function toMillis(v: unknown): number {
  if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis()
  }
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isNaN(t) ? 0 : t
  }
  if (typeof v === 'number') return v
  return 0
}

/**
 * Group a flat list of FeedbackNodes into threads.
 * Roots are sorted newest-first; replies under each root are chronological (oldest-first).
 * Orphaned replies (whose root is not in the list) are silently dropped.
 */
export function groupThreads(nodes: FeedbackNode[]): Thread[] {
  const roots = nodes.filter((n) => n.parentId === null)
  const byParent = new Map<string, FeedbackNode[]>()
  for (const n of nodes) {
    if (n.parentId !== null) {
      const arr = byParent.get(n.parentId) ?? []
      arr.push(n)
      byParent.set(n.parentId, arr)
    }
  }
  return roots
    .slice()
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .map((root) => ({
      root,
      replies: (byParent.get(root.id) ?? [])
        .slice()
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt)),
    }))
}

/**
 * Return true if any of a comment's anchored beats were changed in a version
 * that is strictly newer than the version the comment was written against.
 * General comments (no anchors) always return false.
 * Comments already on the current version return false.
 */
export function changedSince(
  node: FeedbackNode,
  currentVersion: number,
  versions: VersionEntry[],
): boolean {
  if (!node.anchors.length || currentVersion <= node.comicVersion) return false
  const refs = new Set<string>()
  for (const v of versions) {
    if (v.version > node.comicVersion) {
      for (const r of v.changedBeatRefs ?? []) refs.add(r)
    }
  }
  return node.anchors.some((a) => refs.has(a.beatRef))
}

/**
 * Return true if a comment should be visible to the current viewer.
 * Hidden comments are only visible to admins.
 */
export function visibleTo(node: FeedbackNode, isAdmin: boolean): boolean {
  return isAdmin || !node.hidden
}

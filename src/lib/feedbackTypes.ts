// Pure types + helpers for feedback. No Firestore imports — unit-testable.

export type Status = 'open' | 'in_progress' | 'resolved' | 'deferred' | 'wont_fix'

export type Category =
  | 'fact' | 'repetition' | 'tone' | 'clarity' | 'pacing' | 'continuity'
  | 'missing' | 'art' | 'source' | 'sensitivity' | 'language' | 'question' | 'other'

export const CATEGORY_LABELS: Record<Category, string> = {
  fact: 'Fact', repetition: 'Repetition', tone: 'Tone/Voice', clarity: 'Clarity',
  pacing: 'Pacing/Layout', continuity: 'Continuity', missing: 'Missing/Enrichment',
  art: 'Art direction', source: 'Source/Citation', sensitivity: 'Sensitivity',
  language: 'Language', question: 'Question', other: 'Other',
}

export const CATEGORY_ORDER: Category[] = ['fact','repetition','tone','clarity','pacing','continuity','missing','art','source','sensitivity','language','question','other']

/**
 * Single source of truth mapping each Status to a colour set. Used by the status
 * pill, the gutter card accent, the filter chips, and the in-script anchored-line
 * highlight (the hex drives the `--beat-colour` custom property + badge bg).
 * Status now drives comment colour everywhere (replacing the per-thread
 * BADGE_PALETTE); the badge NUMBER still distinguishes threads.
 */
export const STATUS_COLOR: Record<Status, { hex: string; label: string }> = {
  open:        { hex: '#e0a000', label: 'Open' },        // amber
  in_progress: { hex: '#4c8dff', label: 'In progress' }, // blue
  resolved:    { hex: '#3ea869', label: 'Resolved' },    // green
  deferred:    { hex: '#8a8a99', label: 'Deferred' },    // slate
  wont_fix:    { hex: '#c2603a', label: "Won't fix" },   // muted red/clay
}

export type AnchorKind = 'page' | 'panel' | 'beat'

export interface Anchor {
  kind: AnchorKind
  ref: string // page: "p13" · panel: "p13.pl1" · beat: "p13.pl1.b2" | "p13.pl1.art"
  page: number
  panel?: number // absent for page anchors
  snapshot: string // the unit's text (or a label like "Page 13" / "Panel 1")
}

/** Short chip label for an anchor, distinct by kind. */
export function anchorLabel(a: Anchor): string {
  if (a.kind === 'page') return `Page ${a.page}`
  if (a.kind === 'panel') return `Panel ${a.panel} · p${a.page}`
  return `P${a.page}·${a.panel}`
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
  /** Optional — old docs / replies may lack it; treat missing as 'other' for display. */
  category?: Category
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
 * Return true if any of a comment's anchored units were changed in a version
 * that is strictly newer than the version the comment was written against.
 * General comments (no anchors) always return false.
 * Comments already on the current version return false.
 *
 * `changedBeatRefs` are always beat-level (`pP.plN.bK` / `pP.plN.art`). A page
 * or panel anchor counts as changed if any beat under it changed: an anchor
 * matches when its `ref` is exactly a changed beat ref, OR some changed beat
 * ref starts with `ref + '.'` (the `.` guards against `p1` matching `p13…`).
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
  return node.anchors.some(
    (a) => refs.has(a.ref) || [...refs].some((cr) => cr.startsWith(a.ref + '.')),
  )
}

/**
 * Return true if a comment should be visible to the current viewer.
 * Hidden comments are only visible to admins.
 */
export function visibleTo(node: FeedbackNode, isAdmin: boolean): boolean {
  return isAdmin || !node.hidden
}

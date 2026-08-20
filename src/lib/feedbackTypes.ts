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

export type AnchorKind = 'page' | 'panel' | 'beat' | 'box'

export interface Anchor {
  kind: AnchorKind
  // page: "p13" · panel: "p13.pl1" · beat: "p13.pl1.b2" | "p13.pl1.art" · box: "p13.b3"
  ref: string
  page: number
  panel?: number // absent for page and box anchors
  /** Present only for box anchors — one balloon/caption in a TRANSLATED script.
   *  Kept distinct from a beat because translation boxes do not map onto
   *  script.md beats (they disagree on ~12% of pages). */
  box?: number
  snapshot: string // the unit's text (or a label like "Page 13" / "Panel 1")
}

/** Short chip label for an anchor, distinct by kind. */
export function anchorLabel(a: Anchor): string {
  if (a.kind === 'page') return `Page ${a.page}`
  if (a.kind === 'panel') return `Panel ${a.panel} · p${a.page}`
  if (a.kind === 'box') return `Box ${a.box} · p${a.page}`
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
  /** The language this comment was WRITTEN in. Always a concrete code, never
   *  'all'. Absent on the 272 comments predating language support — those are
   *  read as the comic's original language. */
  lang?: string
  /** Who it is for: the same concrete code (this language only) or 'all'.
   *  Absent is read as single-language, because a comment written against a
   *  single-language reader was never an assertion about other languages. */
  langScope?: string
  comicVersion: number
  hidden: boolean
  /** Approval gate. Missing is treated as a draft for display; seeded/backfilled docs are `true`. */
  published?: boolean
  createdAt: unknown
  updatedAt?: unknown
  editedAt?: unknown | null
}

/** A comment is a draft until explicitly published (a moderator approving it). */
export function isDraft(n: FeedbackNode): boolean {
  return n.published !== true
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


// ── Language scoping ─────────────────────────────────────────────────────────
//
// A comment carries TWO language fields, not one. A single
// `lang: 'en' | 'hi' | 'all'` would lose which language a SHARED comment was
// written in — and that is exactly what the display rule depends on: precise in
// its home language, page-level everywhere else.

/** The concrete language a comment was written in. A doc predating language
 *  support is attributed to the comic's original language. */
export function nodeLang(n: FeedbackNode, originalLanguage: string): string {
  return n.lang ?? originalLanguage
}

/** Should this comment be shown while reading `code`? */
export function appliesToLanguage(
  n: FeedbackNode, code: string, originalLanguage: string,
): boolean {
  if (n.langScope === 'all') return true
  return nodeLang(n, originalLanguage) === code
}

/** True when a comment applies here but was written in another language. */
export function isForeign(
  n: FeedbackNode, code: string, originalLanguage: string,
): boolean {
  return appliesToLanguage(n, code, originalLanguage)
    && nodeLang(n, originalLanguage) !== code
}

/**
 * The anchors as `code` should display them.
 *
 * At home — the language it was written in — the precise pin is kept. Away, it
 * is shown on its PAGE, because pages are the only anchor that aligns across
 * languages: translation boxes and script beats disagree on ~12% of pages, so a
 * beat ref means nothing in a translated script and a box ref means nothing in
 * the master.
 *
 * The stored anchors are NEVER mutated; this is display only, so switching back
 * restores full precision.
 */
export function displayAnchors(
  n: FeedbackNode, code: string, originalLanguage: string,
): Anchor[] {
  if (!n.anchors.length) return []
  if (nodeLang(n, originalLanguage) === code) return n.anchors
  const byPage = new Map<number, Anchor>()
  for (const a of n.anchors) {
    if (byPage.has(a.page)) continue
    byPage.set(a.page, {
      kind: 'page', ref: `p${a.page}`, page: a.page, snapshot: `Page ${a.page}`,
    })
  }
  return [...byPage.values()]
}

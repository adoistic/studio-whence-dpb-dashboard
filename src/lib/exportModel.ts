// Pure builder for the export model — the one image-first page ontology all
// three export formats render from. No Firestore, no DOM, no fetch: the
// caller hands in live threads (already visibility-filtered), the parsed
// draft (or null for script-less comics) and the dialog options.
import type { Comic } from '@/types/content'
import { anchorLabel, toMillis, type AnchorKind, type Thread } from '@/lib/feedbackTypes'
import type { Page as DraftPage } from '@/lib/comicDocx'

export interface ExportOptions {
  includeComments: boolean
  includeScript: boolean
  includeResolved: boolean
}
export interface ExportReply { author: string; role: string; body: string; createdAt: string | null }
export interface ExportThread {
  id: string
  status: string
  category: string
  author: string
  role: string
  body: string
  createdAt: string | null
  anchor: { kind: AnchorKind; label: string; snapshot: string } | null
  alsoOnPages: number[]
  replies: ExportReply[]
}
export interface ExportPage {
  page: number
  image: string | null
  script: DraftPage | null
  comments: ExportThread[]
}
export interface ExportComicModel {
  comic: { line: string; slug: string; title: string }
  hasScript: boolean
  options: ExportOptions
  cover: { image: string } | null
  pages: ExportPage[]
  generalComments: ExportThread[]
}

function iso(v: unknown): string | null {
  const ms = toMillis(v)
  return ms ? new Date(ms).toISOString() : null
}

/** Project a Thread onto one page (or null page = general). */
function exportThread(t: Thread, page: number | null): ExportThread {
  const anchors = t.root.anchors
  const a = page === null ? undefined : anchors.find((x) => x.page === page)
  const pages = [...new Set(anchors.map((x) => x.page))].sort((x, y) => x - y)
  return {
    id: t.root.id,
    status: t.root.status ?? 'open',
    category: t.root.category ?? 'other',
    author: t.root.authorName,
    role: t.root.authorRole,
    body: t.root.body,
    createdAt: iso(t.root.createdAt),
    anchor: a ? { kind: a.kind, label: anchorLabel(a), snapshot: a.snapshot } : null,
    alsoOnPages: page === null ? [] : pages.filter((p) => p !== page),
    replies: t.replies.map((r) => ({
      author: r.authorName, role: r.authorRole, body: r.body, createdAt: iso(r.createdAt),
    })),
  }
}

export function buildExportModel(args: {
  comic: Comic
  threads: Thread[]
  draftPages: DraftPage[] | null
  options: ExportOptions
}): ExportComicModel {
  const { comic, draftPages, options } = args
  const count = comic.pages?.hasPages ? comic.pages.count : 0

  const included = options.includeComments
    ? args.threads.filter((t) => {
        const s = t.root.status ?? 'open'
        return options.includeResolved || (s !== 'resolved' && s !== 'wont_fix')
      })
    : []

  const anchored = included.filter((t) => t.root.anchors.length > 0)
  const general = included.filter((t) => t.root.anchors.length === 0)

  // Chronological within a page: oldest first reads as a review trail.
  const byCreated = (a: Thread, b: Thread) => toMillis(a.root.createdAt) - toMillis(b.root.createdAt)

  const scriptByNumber = new Map<number, DraftPage>()
  for (const p of draftPages ?? []) scriptByNumber.set(Number(p.number), p)

  const pageNumbers = new Set<number>()
  for (let n = 1; n <= count; n++) pageNumbers.add(n)
  for (const t of anchored) for (const a of t.root.anchors) pageNumbers.add(a.page)

  const pages: ExportPage[] = [...pageNumbers].sort((a, b) => a - b).map((n) => ({
    page: n,
    image: n <= count ? `pages/page-${String(n).padStart(2, '0')}.jpg` : null,
    script: options.includeScript ? (scriptByNumber.get(n) ?? null) : null,
    comments: anchored
      .filter((t) => t.root.anchors.some((a) => a.page === n))
      .sort(byCreated)
      .map((t) => exportThread(t, n)),
  }))

  return {
    comic: { line: comic.line, slug: comic.slug, title: comic.title },
    hasScript: (draftPages?.length ?? 0) > 0,
    options,
    cover: comic.pages?.coverKey ? { image: 'cover.jpg' } : null,
    pages,
    generalComments: general.sort(byCreated).map((t) => exportThread(t, null)),
  }
}

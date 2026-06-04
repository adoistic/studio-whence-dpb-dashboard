'use client'

import { useMemo, useState } from 'react'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { useComicFeedback, addReply, setStatus, setPublished, editComment, hideComment, deleteComment } from '@/lib/feedback'
import { useComicVersions } from '@/lib/useComicVersions'
import {
  visibleTo,
  changedSince,
  anchorLabel,
  STATUS_COLOR,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type Category,
  type Status,
  type Thread,
} from '@/lib/feedbackTypes'
import { assignBadges } from '@/components/feedback/badges'
import { CommentThread } from '@/components/feedback/CommentThread'

export interface CommentsViewProps {
  comicId: string
  line: string
  comicVersion: number
  draftText: string | null
  onJumpInDraft: (ref: string) => void
}

// Status filter chips, in display order. Default = "unaddressed" (open +
// in_progress), matching the gutter; addressed/parked statuses are hidden until
// toggled on.
const STATUS_FILTERS: { value: Status; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'wont_fix', label: "Won't fix" },
]
const DEFAULT_STATUSES: Status[] = ['open', 'in_progress']

export function CommentsView({
  comicId,
  line,
  comicVersion,
  draftText,
  onJumpInDraft,
}: CommentsViewProps) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { user, loading: authLoading } = useUser()
  const allowStatus = useAllowStatus(user, authLoading)
  const isAdmin = allowStatus === 'admin'
  // Moderation (see drafts + hidden, status/hide/delete-any) — admins + sub-admins.
  const canMod = canModerate(allowStatus)
  const currentEmail = user?.email ?? ''
  const author = {
    email: currentEmail,
    name: user?.displayName ?? currentEmail,
    role: isAdmin ? 'admin' : canMod ? 'sub_admin' : 'allow',
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: threads } = useComicFeedback(comicId, canMod)
  const { data: versions } = useComicVersions(comicId)

  // ── Visibility + badge numbering (over the full visible set) ───────────────
  const visible = threads.filter((t) => visibleTo(t.root, canMod))
  const badges = assignBadges(visible)

  // ── Draft-derived parsing (all in useMemo — no ref reads during render) ─────
  // Map ref → its first appearance order in the rendered draft, so anchored
  // threads can be ordered by document position.
  const refOrder = useMemo(() => {
    const m = new Map<string, number>()
    if (draftText) {
      const re = /data-(?:page|panel|beat)-ref="([^"]+)"/g
      let i = 0
      for (const match of draftText.matchAll(re)) {
        if (!m.has(match[1])) m.set(match[1], i++)
      }
    }
    return m
  }, [draftText])

  // Refs that still exist in the current draft — drives CommentThread's live vs
  // orphaned anchor chips.
  const knownRefs = useMemo(() => {
    const s = new Set<string>()
    if (draftText)
      for (const re of [
        /data-beat-ref="([^"]+)"/g,
        /data-panel-ref="([^"]+)"/g,
        /data-page-ref="([^"]+)"/g,
      ])
        for (const m of draftText.matchAll(re)) s.add(m[1])
    return s
  }, [draftText])

  // ── Filters ────────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(() => new Set(DEFAULT_STATUSES))
  const [categoryFilter, setCategoryFilter] = useState<Set<Category>>(() => new Set(CATEGORY_ORDER))

  function toggleStatus(s: Status) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }
  function toggleCategory(c: Category) {
    setCategoryFilter((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  // ── Filter + order ─────────────────────────────────────────────────────────
  // Filter by selected statuses AND categories (statusless → 'open',
  // categoryless → 'other'). Then order: anchored threads first, by the document
  // position of their first anchor; general threads after, in createdAt order
  // (groupThreads already sorts roots newest-first, which carries through).
  const ordered = useMemo(() => {
    const matched = visible.filter(
      (t) =>
        statusFilter.has(t.root.status ?? 'open') &&
        categoryFilter.has(t.root.category ?? 'other'),
    )
    const anchored: Thread[] = []
    const general: Thread[] = []
    for (const t of matched) {
      if (t.root.anchors.length > 0) anchored.push(t)
      else general.push(t)
    }
    const LAST = Number.MAX_SAFE_INTEGER
    anchored.sort((a, b) => {
      const ai = refOrder.get(a.root.anchors[0].ref) ?? LAST
      const bi = refOrder.get(b.root.anchors[0].ref) ?? LAST
      return ai - bi
    })
    return [...anchored, ...general]
    // `visible` is derived fresh each render; key the memo on the stable inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, canMod, statusFilter, categoryFilter, refOrder])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-lg border border-brand-pale-dusk bg-brand-threshold/70 p-4 font-sans">
        {/* Status filters */}
        <div className="flex flex-col gap-1.5">
          <span className="font-sans text-[0.6rem] font-semibold uppercase tracking-label text-brand-slate">
            Status
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map(({ value, label }) => {
              const on = statusFilter.has(value)
              const hex = STATUS_COLOR[value].hex
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleStatus(value)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-sans text-[0.66rem] font-medium uppercase tracking-label transition-colors ${
                    on
                      ? 'border-brand-indigo bg-brand-indigo text-brand-pale-dusk'
                      : 'border-brand-pale-dusk bg-white text-brand-slate hover:border-brand-lavender/60 hover:text-brand-indigo'
                  }`}
                >
                  <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: hex }} />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Category filters */}
        <div className="flex flex-col gap-1.5">
          <span className="font-sans text-[0.6rem] font-semibold uppercase tracking-label text-brand-slate">
            Category
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORY_ORDER.map((c) => {
              const on = categoryFilter.has(c)
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCategory(c)}
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-sans text-[0.66rem] font-medium uppercase tracking-label transition-colors ${
                    on
                      ? 'border-brand-indigo bg-brand-indigo text-brand-pale-dusk'
                      : 'border-brand-pale-dusk bg-white text-brand-slate hover:border-brand-lavender/60 hover:text-brand-indigo'
                  }`}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Thread list ─────────────────────────────────────────────────── */}
      {ordered.length > 0 ? (
        <div className="flex flex-col gap-6">
          {ordered.map((t) => {
            const statusColour = STATUS_COLOR[t.root.status ?? 'open'].hex
            const isAnchored = t.root.anchors.length > 0
            return (
              <article key={t.root.id} className="flex flex-col gap-2.5">
                {/* Context header — what this comment is attached to. */}
                {isAnchored ? (
                  <div className="flex flex-col gap-2">
                    {t.root.anchors.map((anchor) => (
                      <div key={anchor.ref} className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => onJumpInDraft(anchor.ref)}
                          className="self-start font-sans text-[0.62rem] font-semibold uppercase tracking-label text-brand-indigo transition-opacity hover:opacity-70"
                        >
                          {anchorLabel(anchor)}
                        </button>
                        <blockquote
                          className="border-l-[3px] py-1 pl-3 font-serif text-sm italic leading-relaxed text-brand-umber"
                          style={{
                            borderLeftColor: statusColour,
                            background: `color-mix(in srgb, ${statusColour} 8%, transparent)`,
                          }}
                        >
                          {anchor.snapshot}
                        </blockquote>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="font-sans text-[0.62rem] font-semibold uppercase tracking-label text-brand-slate/70">
                    Whole comic
                  </span>
                )}

                {/* The thread itself — reuse the gutter's thread component. */}
                <CommentThread
                  thread={t}
                  badge={badges.get(t.root.id)}
                  canModerate={canMod}
                  currentEmail={currentEmail}
                  changedSince={changedSince(t.root, comicVersion, versions)}
                  knownRefs={knownRefs}
                  onReply={async (body, published) => {
                    await addReply({ comicId, line, parentId: t.root.id, body, comicVersion, published }, author)
                  }}
                  onSetStatus={(s) => setStatus(t.root.id, s)}
                  onHide={(h) => hideComment(t.root.id, h)}
                  onDelete={(id) => deleteComment(id)}
                  onJumpToBeat={onJumpInDraft}
                  onApprove={() => setPublished(t.root.id, true, { email: author.email, name: author.name })}
                  onEdit={async (body) => {
                    await editComment(t.root.id, { body })
                  }}
                />
              </article>
            )
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-brand-pale-dusk bg-brand-threshold/40 px-4 py-8 text-center font-sans text-[0.8rem] text-brand-slate">
          {visible.length > 0
            ? 'No comments match the current filters.'
            : 'No comments yet. Add one from the Draft view.'}
        </p>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import type { Thread, FeedbackNode, Status, Category } from '@/lib/feedbackTypes'
import { languageLabel } from '@/lib/comicLanguages'
import { toMillis, anchorLabel, isDraft, STATUS_COLOR, CATEGORY_LABELS, displayAnchors, isForeign, nodeLang } from '@/lib/feedbackTypes'
import type { Badge } from '@/components/feedback/badges'
import { CommentComposer } from '@/components/feedback/CommentComposer'
import { PinIcon } from '@/components/feedback/icons'

const STATUS_LABELS: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  deferred: 'Deferred',
  wont_fix: "Won't fix",
}

/** Simple relative-time formatter — avoids adding a date-fns dependency. */
function relativeTime(createdAt: unknown): string {
  const ms = toMillis(createdAt)
  if (!ms) return ''
  const diff = Date.now() - ms
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  // Fall back to ISO date string
  return new Date(ms).toISOString().slice(0, 10)
}

export interface CommentThreadProps {
  thread: Thread
  badge?: Badge
  /** Moderation rights (admin or sub_admin): status select, hide, delete-any, see hidden. */
  canModerate: boolean
  currentEmail: string
  changedSince: boolean
  knownRefs: Set<string>
  onReply: (body: string, published?: boolean) => Promise<void>
  onSetStatus: (status: Status) => void
  onHide: (hidden: boolean) => void
  onDelete: (nodeId: string) => void
  onJumpToBeat: (beatRef: string) => void
  /** Approve (publish) a draft — moderators only. */
  onApprove: () => void
  /** Edit the root comment body — moderator or the comment's author. */
  onEdit: (body: string) => Promise<void>
  /** The language being read. Optional: without it the thread renders exactly
   *  as it always has, with its stored anchors and no origin tag. */
  lang?: string
  /** The comic's authored language — how a pre-language comment is attributed. */
  originalLanguage?: string
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

function StatusPillFeedback({ status }: { status: Status }) {
  const hex = STATUS_COLOR[status]?.hex ?? STATUS_COLOR.open.hex
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-[0.6rem] uppercase tracking-label"
      style={{
        borderColor: `color-mix(in srgb, ${hex} 50%, transparent)`,
        background: `color-mix(in srgb, ${hex} 14%, transparent)`,
        color: hex,
      }}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: hex }} />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function NodeMeta({ node }: { node: FeedbackNode }) {
  const time = relativeTime(node.createdAt)
  return (
    <span className="font-sans text-[0.7rem] text-brand-slate">
      <span className="font-medium text-brand-umber">{node.authorName}</span>
      {time && (
        <>
          {' · '}
          <time dateTime={typeof node.createdAt === 'string' ? node.createdAt : undefined}>
            {time}
          </time>
        </>
      )}
    </span>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

export function CommentThread({
  thread,
  badge,
  canModerate,
  currentEmail,
  changedSince,
  knownRefs,
  onReply,
  onSetStatus,
  onHide,
  onDelete,
  onJumpToBeat,
  onApprove,
  onEdit,
  lang,
  originalLanguage,
}: CommentThreadProps) {
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const { root, replies } = thread
  const origLang = originalLanguage ?? 'en'
  const activeLang = lang ?? origLang
  const shownAnchors = displayAnchors(root, activeLang, origLang)
  const foreign = isForeign(root, activeLang, origLang)

  // Status drives the comment colour everywhere (badge bg, card accent, pill).
  const statusColour = STATUS_COLOR[root.status ?? 'open'].hex
  const categoryLabel = CATEGORY_LABELS[root.category ?? 'other']
  const canDeleteRoot = canModerate || root.authorEmail === currentEmail
  const canEditRoot = canModerate || root.authorEmail === currentEmail
  const rootIsDraft = isDraft(root)

  async function handleReply(body: string, _category?: Category, published?: boolean) {
    await onReply(body, published)
    setReplying(false)
  }

  function startEdit() {
    setEditText(root.body)
    setEditing(true)
  }

  async function handleSaveEdit() {
    const trimmed = editText.trim()
    if (!trimmed || savingEdit) return
    setSavingEdit(true)
    try {
      await onEdit(trimmed)
      setEditing(false)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div
      className="flex flex-col gap-0 rounded-[2px] border border-l-4 border-brand-pale-dusk bg-brand-threshold shadow-sm"
      style={{ borderLeftColor: statusColour }}
    >
      {/* ── Root comment ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-3">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Badge chip — number distinguishes threads; colour follows status */}
          {badge && (
            <span
              aria-label={`thread ${badge.num}`}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-sans text-[0.65rem] font-semibold text-white"
              style={{ background: statusColour }}
            >
              {badge.num}
            </span>
          )}

          <NodeMeta node={root} />

          {/* Category chip */}
          <span className="inline-flex items-center rounded-full border border-brand-pale-dusk bg-brand-pale-dusk/40 px-2 py-0.5 font-sans text-[0.6rem] uppercase tracking-label text-brand-umber">
            {categoryLabel}
          </span>

          {/* Status pill */}
          {root.status && <StatusPillFeedback status={root.status} />}

          {/* Draft pill — moderators receive every draft; a member receives
              only their OWN drafts (awaiting approval). Either way it simply
              follows the data (no extra gating). */}
          {rootIsDraft && (
            <span className="inline-flex items-center rounded-full border border-brand-gold/50 bg-brand-gold/10 px-2 py-0.5 font-sans text-[0.6rem] uppercase tracking-label text-brand-gold">
              Draft
            </span>
          )}

          {/* Hidden indicator (moderators only) */}
          {canModerate && root.hidden && (
            <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate opacity-60">
              hidden
            </span>
          )}
        </div>

        {/* Anchors — shown as THIS language should see them. A comment shared
            across languages keeps its precise pin at home and appears on its
            page elsewhere; the stored anchors are never mutated. */}
        {shownAnchors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {foreign && (
              <span className="inline-flex items-center rounded-full border border-brand-lavender/30 px-2 py-0.5 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
                from the {languageLabel(nodeLang(root, origLang))} edition
              </span>
            )}
            {shownAnchors.map((anchor) => {
              const label = anchorLabel(anchor)
              const alive = knownRefs.has(anchor.ref)
              if (alive) {
                return (
                  <button
                    key={anchor.ref}
                    type="button"
                    aria-label={`Jump to ${label}`}
                    onClick={() => onJumpToBeat(anchor.ref)}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-lavender/30 bg-brand-pale-dusk px-2 py-0.5 font-sans text-[0.65rem] text-brand-indigo transition-colors hover:bg-brand-lavender/20"
                  >
                    <PinIcon className="h-3 w-3" />
                    {label}
                  </button>
                )
              }
              // Orphaned anchor
              return (
                <span
                  key={anchor.ref}
                  className="inline-flex flex-col rounded-[2px] border border-brand-pale-dusk bg-brand-pale-dusk/40 px-2 py-1 font-sans text-[0.65rem] text-brand-slate"
                >
                  <span className="line-through opacity-60">{anchor.snapshot}</span>
                  <span className="text-[0.6rem] italic text-brand-umber/70">
                    anchored text no longer exists
                  </span>
                </span>
              )
            })}
          </div>
        )}

        {/* Changed-since flag */}
        {changedSince && (
          <p className="flex items-center gap-1 font-sans text-[0.65rem] text-brand-gold">
            <span aria-hidden>✦</span>
            This beat changed since this comment was written.
          </p>
        )}

        {/* Body — inline editable for a moderator or the author. */}
        {editing ? (
          <div className="flex flex-col gap-2">
            <label className="sr-only" htmlFor={`edit-comment-${root.id}`}>
              Edit comment
            </label>
            <textarea
              id={`edit-comment-${root.id}`}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-[2px] border border-brand-pale-dusk bg-white px-2.5 py-2 font-sans text-sm text-brand-deep placeholder:text-brand-slate/60 focus:border-brand-lavender focus:outline-none focus:ring-1 focus:ring-brand-lavender/40"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-[2px] px-3 py-1 font-sans text-xs text-brand-slate transition-colors hover:bg-brand-pale-dusk hover:text-brand-deep"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={!editText.trim() || savingEdit}
                className="rounded-[2px] bg-brand-indigo px-3 py-1 font-sans text-xs text-brand-pale-dusk transition-colors hover:bg-brand-twilight-mid disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <p className="font-sans text-sm leading-relaxed text-brand-deep">{root.body}</p>
        )}

        {/* Moderation controls */}
        {canModerate && (
          <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-brand-pale-dusk pt-2">
            {/* Status select */}
            <select
              aria-label="comment status"
              value={root.status ?? 'open'}
              onChange={(e) => onSetStatus(e.target.value as Status)}
              className="rounded-[2px] border border-brand-pale-dusk bg-white px-2 py-0.5 font-sans text-[0.7rem] text-brand-deep focus:border-brand-lavender focus:outline-none"
            >
              {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            {/* Approve — only while still a draft. */}
            {rootIsDraft && (
              <button
                type="button"
                onClick={onApprove}
                className="rounded-[2px] px-2 py-0.5 font-sans text-[0.7rem] font-semibold text-brand-indigo transition-colors hover:bg-brand-pale-dusk"
              >
                Approve
              </button>
            )}

            {/* Edit root body */}
            {!editing && (
              <button
                type="button"
                onClick={startEdit}
                className="rounded-[2px] px-2 py-0.5 font-sans text-[0.7rem] text-brand-slate transition-colors hover:bg-brand-pale-dusk hover:text-brand-deep"
              >
                Edit
              </button>
            )}

            {/* Hide/unhide toggle */}
            <button
              type="button"
              onClick={() => onHide(!root.hidden)}
              className="rounded-[2px] px-2 py-0.5 font-sans text-[0.7rem] text-brand-slate transition-colors hover:bg-brand-pale-dusk hover:text-brand-deep"
            >
              {root.hidden ? 'Unhide' : 'Hide'}
            </button>

            {/* Delete root */}
            <button
              type="button"
              aria-label="delete comment"
              onClick={() => onDelete(root.id)}
              className="rounded-[2px] px-2 py-0.5 font-sans text-[0.7rem] text-red-600 transition-colors hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}

        {/* Author-only controls (non-moderator, own root): edit + delete. */}
        {!canModerate && (canDeleteRoot || canEditRoot) && (
          <div className="mt-1 flex items-center gap-2 border-t border-brand-pale-dusk pt-2">
            {canEditRoot && !editing && (
              <button
                type="button"
                onClick={startEdit}
                className="rounded-[2px] px-2 py-0.5 font-sans text-[0.7rem] text-brand-slate transition-colors hover:bg-brand-pale-dusk hover:text-brand-deep"
              >
                Edit
              </button>
            )}
            {canDeleteRoot && (
              <button
                type="button"
                aria-label="delete comment"
                onClick={() => onDelete(root.id)}
                className="rounded-[2px] px-2 py-0.5 font-sans text-[0.7rem] text-red-600 transition-colors hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Replies ───────────────────────────────────────────────────── */}
      {replies.length > 0 && (
        <div className="flex flex-col gap-0 border-t border-brand-pale-dusk">
          {replies.map((reply) => {
            const canDeleteReply = canModerate || reply.authorEmail === currentEmail
            return (
              <div
                key={reply.id}
                className="flex flex-col gap-1.5 border-b border-brand-pale-dusk/60 py-2.5 pl-6 pr-3 last:border-b-0"
              >
                <NodeMeta node={reply} />
                <p className="font-sans text-sm leading-relaxed text-brand-deep">{reply.body}</p>
                {canDeleteReply && (
                  <button
                    type="button"
                    aria-label="delete reply"
                    onClick={() => onDelete(reply.id)}
                    className="self-start rounded-[2px] px-2 py-0.5 font-sans text-[0.7rem] text-red-600 transition-colors hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Reply affordance ──────────────────────────────────────────── */}
      <div className="border-t border-brand-pale-dusk p-3">
        {replying ? (
          <CommentComposer
            mode="reply"
            anchors={[]}
            onAddAnchor={() => {}}
            onRemoveAnchor={() => {}}
            onSubmit={handleReply}
            onCancel={() => setReplying(false)}
            canPublishDirectly={canModerate}
          />
        ) : (
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="font-sans text-[0.7rem] text-brand-lavender transition-colors hover:text-brand-indigo"
          >
            Reply
          </button>
        )}
      </div>
    </div>
  )
}

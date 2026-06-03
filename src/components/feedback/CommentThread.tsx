'use client'

import { useState } from 'react'
import type { Thread, FeedbackNode, Status } from '@/lib/feedbackTypes'
import { toMillis, anchorLabel } from '@/lib/feedbackTypes'
import type { Badge } from '@/components/feedback/badges'
import { CommentComposer } from '@/components/feedback/CommentComposer'
import { BADGE_PALETTE } from '@/components/feedback/constants'
import { PinIcon } from '@/components/feedback/icons'

const STATUS_LABELS: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  deferred: 'Deferred',
  wont_fix: "Won't fix",
}

const STATUS_DOT: Record<Status, string> = {
  open: 'bg-brand-lavender',
  in_progress: 'bg-brand-gold',
  resolved: 'bg-[#1fb6a6]',
  deferred: 'bg-brand-slate',
  wont_fix: 'bg-brand-umber',
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
  isAdmin: boolean
  currentEmail: string
  changedSince: boolean
  knownRefs: Set<string>
  onReply: (body: string) => Promise<void>
  onSetStatus: (status: Status) => void
  onHide: (hidden: boolean) => void
  onDelete: (nodeId: string) => void
  onJumpToBeat: (beatRef: string) => void
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

function StatusPillFeedback({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-pale-dusk bg-brand-threshold px-2 py-0.5 font-sans text-[0.6rem] uppercase tracking-label text-brand-umber">
      <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? 'bg-brand-slate'}`} />
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
  isAdmin,
  currentEmail,
  changedSince,
  knownRefs,
  onReply,
  onSetStatus,
  onHide,
  onDelete,
  onJumpToBeat,
}: CommentThreadProps) {
  const [replying, setReplying] = useState(false)
  const { root, replies } = thread

  const badgeColour = badge ? BADGE_PALETTE[(badge.num - 1) % BADGE_PALETTE.length] : undefined
  const canDeleteRoot = isAdmin || root.authorEmail === currentEmail

  async function handleReply(body: string) {
    await onReply(body)
    setReplying(false)
  }

  return (
    <div className="flex flex-col gap-0 rounded-[2px] border border-brand-pale-dusk bg-brand-threshold shadow-sm">
      {/* ── Root comment ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-3">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Badge chip */}
          {badge && badgeColour && (
            <span
              aria-label={`thread ${badge.num}`}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-sans text-[0.65rem] font-semibold text-white"
              style={{ background: badgeColour }}
            >
              {badge.num}
            </span>
          )}

          <NodeMeta node={root} />

          {/* Status pill */}
          {root.status && <StatusPillFeedback status={root.status} />}

          {/* Hidden indicator (admin only) */}
          {isAdmin && root.hidden && (
            <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate opacity-60">
              hidden
            </span>
          )}
        </div>

        {/* Anchors */}
        {root.anchors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {root.anchors.map((anchor) => {
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

        {/* Body */}
        <p className="font-sans text-sm leading-relaxed text-brand-deep">{root.body}</p>

        {/* Admin controls */}
        {isAdmin && (
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

        {/* Author-only delete (non-admin, own root) */}
        {!isAdmin && canDeleteRoot && (
          <div className="mt-1 flex items-center gap-2 border-t border-brand-pale-dusk pt-2">
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
      </div>

      {/* ── Replies ───────────────────────────────────────────────────── */}
      {replies.length > 0 && (
        <div className="flex flex-col gap-0 border-t border-brand-pale-dusk">
          {replies.map((reply) => {
            const canDeleteReply = isAdmin || reply.authorEmail === currentEmail
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

'use client'

import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import {
  useComicFeedback,
  addComment,
  addReply,
  setStatus,
  setPublished,
  editComment,
  hideComment,
  deleteComment,
} from '@/lib/feedback'
import { useComicVersions } from '@/lib/useComicVersions'
import {
  visibleTo,
  changedSince,
  anchorLabel,
  STATUS_COLOR,
  type Category,
} from '@/lib/feedbackTypes'
import { pageAnchor, threadsForPage } from '@/lib/readerPages'
import { assignBadges } from '@/components/feedback/badges'
import { CommentThread } from '@/components/feedback/CommentThread'
import { CommentComposer } from '@/components/feedback/CommentComposer'

export interface PageCommentsPanelProps {
  comicId: string
  line: string
  comicVersion: number
  /** Script/rendered page number the panel is scoped to (1-based). */
  page: number
  /** Current draft HTML — used only to mark anchors live vs orphaned. */
  draftText: string | null
  /** Jump to a beat in the Draft view (the shell switches view + scrolls). */
  onJumpInDraft: (ref: string) => void
  onClose: () => void
}

/**
 * Slide-over drawer scoped to ONE rendered page of the comic reader.
 * Lists every thread anchored anywhere on that page (page, panel or beat
 * anchors alike) and composes new comments pinned to the page's `pN` anchor —
 * the same anchor space the Draft view uses, so a comment made here shows
 * there and vice versa. All moderation affordances are the shared
 * CommentThread ones.
 */
export function PageCommentsPanel({
  comicId,
  line,
  comicVersion,
  page,
  draftText,
  onJumpInDraft,
  onClose,
}: PageCommentsPanelProps) {
  // ── Auth (mirrors CommentsView) ──────────────────────────────────────────
  const { user, loading: authLoading } = useUser()
  const allowStatus = useAllowStatus(user, authLoading)
  const isAdmin = allowStatus === 'admin'
  const canMod = canModerate(allowStatus)
  const currentEmail = user?.email ?? ''
  const author = {
    email: currentEmail,
    name: user?.displayName ?? currentEmail,
    role: isAdmin ? 'admin' : canMod ? 'sub_admin' : 'allow',
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: threads } = useComicFeedback(comicId, canMod)
  const { data: versions } = useComicVersions(comicId)

  const visible = threads.filter((t) => visibleTo(t.root, canMod))
  const badges = assignBadges(visible)
  const pageThreads = threadsForPage(visible, page)

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

  // Esc closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submitComment(body: string, category?: Category, published?: boolean) {
    await addComment(
      { comicId, line, anchors: [pageAnchor(page)], body, comicVersion, category, published },
      author,
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Comments on page ${page}`}>
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close page comments"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-brand-indigo/25 backdrop-blur-[2px]"
      />
      {/* Drawer */}
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[27rem] flex-col bg-brand-cream shadow-[-24px_0_60px_-30px_rgba(30,26,58,0.45)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brand-pale-dusk bg-brand-threshold/70 px-5 py-4">
          <div className="flex flex-col">
            <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">
              The comic · feedback
            </span>
            <span className="font-serif text-xl leading-tight text-brand-indigo">
              Page {page}
              <span className="ml-2 font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
                {pageThreads.length === 0
                  ? 'no comments yet'
                  : `${pageThreads.length} comment${pageThreads.length === 1 ? '' : 's'}`}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-3 py-1 font-sans text-[0.95rem] text-brand-slate transition-colors hover:bg-brand-indigo/10 hover:text-brand-indigo"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Composer — pinned to this page's anchor */}
          {currentEmail ? (
            <div className="mb-6">
              <CommentComposer
                mode="comment"
                anchors={[pageAnchor(page)]}
                onAddAnchor={() => {}}
                onRemoveAnchor={() => {}}
                onSubmit={submitComment}
                onCancel={onClose}
                hideAddAnchor
                canPublishDirectly={canMod}
              />
            </div>
          ) : (
            <p className="mb-6 font-sans text-[0.72rem] uppercase tracking-label text-brand-slate">
              Sign in to comment.
            </p>
          )}

          {/* Threads on this page */}
          {pageThreads.length === 0 ? (
            <p className="font-serif italic text-brand-slate">
              Be the first to comment on this page.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {pageThreads.map((t) => {
                const statusColour = STATUS_COLOR[t.root.status ?? 'open'].hex
                return (
                  <article key={t.root.id} className="flex flex-col gap-2">
                    {/* Context header — which unit(s) the thread is pinned to. */}
                    <div className="flex flex-col gap-1.5">
                      {t.root.anchors.map((anchor) => (
                        <div key={anchor.ref} className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onClose()
                              onJumpInDraft(anchor.ref)
                            }}
                            className="self-start font-sans text-[0.62rem] font-semibold uppercase tracking-label text-brand-indigo transition-opacity hover:opacity-70"
                          >
                            {anchorLabel(anchor)}
                          </button>
                          {anchor.kind !== 'page' && (
                            <blockquote
                              className="border-l-[3px] py-1 pl-3 font-serif text-sm italic leading-relaxed text-brand-umber"
                              style={{
                                borderLeftColor: statusColour,
                                background: `color-mix(in srgb, ${statusColour} 8%, transparent)`,
                              }}
                            >
                              {anchor.snapshot}
                            </blockquote>
                          )}
                        </div>
                      ))}
                    </div>
                    <CommentThread
                      thread={t}
                      badge={badges.get(t.root.id)}
                      canModerate={canMod}
                      currentEmail={currentEmail}
                      changedSince={changedSince(t.root, comicVersion, versions)}
                      knownRefs={knownRefs}
                      onReply={async (body, published) => {
                        await addReply(
                          { comicId, line, parentId: t.root.id, body, comicVersion, published: published ?? t.root.published === true },
                          author,
                        )
                      }}
                      onSetStatus={(s) => setStatus(t.root.id, s)}
                      onHide={(hidden) => hideComment(t.root.id, hidden)}
                      onDelete={(nodeId) => deleteComment(nodeId)}
                      onJumpToBeat={(ref) => {
                        onClose()
                        onJumpInDraft(ref)
                      }}
                      onApprove={() => setPublished(t.root.id, true, { email: author.email, name: author.name })}
                      onEdit={async (body) => {
                        await editComment(t.root.id, { body })
                      }}
                    />
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

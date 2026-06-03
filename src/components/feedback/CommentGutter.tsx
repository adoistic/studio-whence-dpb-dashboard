'use client'

import { useState, useMemo, type RefObject } from 'react'
import { useUser, useAllowStatus } from '@/lib/auth'
import { useComicFeedback, addComment, addReply, setStatus, hideComment, deleteComment } from '@/lib/feedback'
import { useComicVersions } from '@/lib/useComicVersions'
import { visibleTo, changedSince, type Anchor } from '@/lib/feedbackTypes'
import { assignBadges } from '@/components/feedback/badges'
import { useBeatMarkers, indexBeats } from '@/components/feedback/useBeatMarkers'
import { CommentComposer } from '@/components/feedback/CommentComposer'
import { CommentThread } from '@/components/feedback/CommentThread'

export interface CommentGutterProps {
  comicId: string
  line: string
  comicVersion: number
  scriptRef: RefObject<HTMLElement | null>
  draftText: string | null
}

// Parse a beatRef like "p13.pl1.b2" → { page: 13, panel: 1 }
function parseBeatRef(beatRef: string): { page: number; panel: number } | null {
  const m = /^p(\d+)\.pl(\d+)\.b\d+$/.exec(beatRef)
  if (!m) return null
  return { page: parseInt(m[1], 10), panel: parseInt(m[2], 10) }
}

export function CommentGutter({
  comicId,
  line,
  comicVersion,
  scriptRef,
  draftText,
}: CommentGutterProps) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { user, loading: authLoading } = useUser()
  const allowStatus = useAllowStatus(user, authLoading)
  const isAdmin = allowStatus === 'admin'
  const currentEmail = user?.email ?? ''
  const author = {
    email: currentEmail,
    name: user?.displayName ?? currentEmail,
    role: isAdmin ? 'admin' : 'allow',
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: threads } = useComicFeedback(comicId)
  const { data: versions } = useComicVersions(comicId)

  // ── Visibility filter ─────────────────────────────────────────────────────
  const visible = threads.filter((t) => visibleTo(t.root, isAdmin))
  const badges = assignBadges(visible)

  // ── Local state ───────────────────────────────────────────────────────────
  const [composing, setComposing] = useState(false)
  const [draftAnchors, setDraftAnchors] = useState<Anchor[]>([])
  const [picking, setPicking] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

  // ── Beat markers ─────────────────────────────────────────────────────────
  useBeatMarkers(scriptRef, visible, draftText, {
    onSelectThread(id) {
      setActiveThreadId(id)
      // Optional: scroll the thread card into view (best-effort)
      const card = document.getElementById(`thread-card-${id}`)
      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    },
    onStartComment(beatRef) {
      const parsed = parseBeatRef(beatRef)
      if (!parsed) return
      const beatEl = scriptRef.current ? indexBeats(scriptRef.current).get(beatRef) : null
      const snapshot = beatEl?.textContent ?? ''
      const anchor: Anchor = { beatRef, page: parsed.page, panel: parsed.panel, snapshot }

      if (picking) {
        // Append anchor (deduped by beatRef)
        setDraftAnchors((prev) =>
          prev.some((a) => a.beatRef === beatRef) ? prev : [...prev, anchor],
        )
        setPicking(false)
      } else {
        // Open fresh composer anchored to this beat
        setComposing(true)
        setDraftAnchors([anchor])
      }
    },
    activeThreadId,
  })

  // ── Computed refs for CommentThread ──────────────────────────────────────
  const knownRefs = useMemo(() => {
    const s = new Set<string>()
    if (draftText) for (const m of draftText.matchAll(/data-beat-ref="([^"]+)"/g)) s.add(m[1])
    return s
  }, [draftText])

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleCreate(body: string) {
    await addComment({ comicId, line, anchors: draftAnchors, body, comicVersion }, author)
    setComposing(false)
    setDraftAnchors([])
    setPicking(false)
  }

  function handleCancel() {
    setComposing(false)
    setDraftAnchors([])
    setPicking(false)
  }

  function handleJump(beatRef: string) {
    const el = scriptRef.current ? indexBeats(scriptRef.current).get(beatRef) : null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Best-effort: highlight the owning thread
    const owning = visible.find((t) => t.root.anchors.some((a) => a.beatRef === beatRef))
    if (owning) setActiveThreadId(owning.root.id)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <aside className="flex flex-col gap-4 font-sans">
      {/* Header + actions */}
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-label text-brand-umber">
          Comments
        </h2>
        <button
          type="button"
          onClick={() => {
            setComposing(true)
            setDraftAnchors([])
            setPicking(false)
          }}
          className="rounded-[2px] border border-brand-lavender/40 bg-brand-threshold px-2.5 py-1 font-sans text-[0.7rem] text-brand-indigo transition-colors hover:bg-brand-pale-dusk hover:text-brand-twilight-mid"
        >
          + General comment
        </button>
      </div>

      {/* Pick-mode hint */}
      {picking && (
        <p className="rounded-[2px] bg-brand-pale-dusk px-3 py-2 font-sans text-[0.7rem] text-brand-indigo">
          Click a beat in the script to add it as a location.
        </p>
      )}

      {/* Composer */}
      {composing && (
        <CommentComposer
          mode="comment"
          anchors={draftAnchors}
          onAddAnchor={() => setPicking(true)}
          onRemoveAnchor={(ref) =>
            setDraftAnchors((prev) => prev.filter((a) => a.beatRef !== ref))
          }
          onSubmit={handleCreate}
          onCancel={handleCancel}
        />
      )}

      {/* Thread list */}
      {visible.length > 0 ? (
        <div className="flex flex-col gap-3">
          {visible.map((t) => (
            <div key={t.root.id} id={`thread-card-${t.root.id}`}>
              <CommentThread
                thread={t}
                badge={badges.get(t.root.id)}
                isAdmin={isAdmin}
                currentEmail={currentEmail}
                changedSince={changedSince(t.root, comicVersion, versions)}
                knownRefs={knownRefs}
                onReply={async (body) => {
                  await addReply({ comicId, line, parentId: t.root.id, body, comicVersion }, author)
                }}
                onSetStatus={(s) => setStatus(t.root.id, s)}
                onHide={(h) => hideComment(t.root.id, h)}
                onDelete={(id) => deleteComment(id)}
                onJumpToBeat={handleJump}
              />
            </div>
          ))}
        </div>
      ) : (
        !composing && (
          <p className="font-sans text-[0.75rem] text-brand-slate/60">No comments yet.</p>
        )
      )}
    </aside>
  )
}

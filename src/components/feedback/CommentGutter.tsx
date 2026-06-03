'use client'

import { useState, useMemo, useEffect, useRef, type RefObject } from 'react'
import { useUser, useAllowStatus } from '@/lib/auth'
import { useComicFeedback, addComment, addReply, setStatus, hideComment, deleteComment } from '@/lib/feedback'
import { useComicVersions } from '@/lib/useComicVersions'
import { visibleTo, changedSince, type Anchor } from '@/lib/feedbackTypes'
import { assignBadges } from '@/components/feedback/badges'
import { useBeatMarkers, indexBeats } from '@/components/feedback/useBeatMarkers'
import { BADGE_PALETTE } from '@/components/feedback/constants'
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

  // The scrollable comment column (independently scrollable from the page).
  const gutterRef = useRef<HTMLDivElement>(null)

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
    // Scroll the PAGE (window) to the anchored beat — block:center.
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Highlight the owning thread.
    const owning = visible.find((t) => t.root.anchors.some((a) => a.beatRef === beatRef))
    if (owning) setActiveThreadId(owning.root.id)
  }

  // Jump from a comment card → its first anchored beat (page scroll + active).
  function handleSelectThread(threadId: string) {
    const owning = visible.find((t) => t.root.id === threadId)
    const firstRef = owning?.root.anchors[0]?.beatRef
    if (firstRef) handleJump(firstRef)
    else setActiveThreadId(threadId)
  }

  // ── Scroll-spy: as the reader scrolls, highlight + reveal the matching card ──
  // Maps each anchored beatRef → its threadId so the observer can resolve hits.
  const refToThread = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of visible) {
      for (const a of t.root.anchors) m.set(a.beatRef, t.root.id)
    }
    return m
    // `visible` is derived fresh each render; key the memo on the stable inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, isAdmin])

  useEffect(() => {
    const container = scriptRef.current
    if (!container || refToThread.size === 0) return

    const beats = indexBeats(container)
    const observed: HTMLElement[] = []
    const elToRef = new Map<Element, string>()
    for (const ref of refToThread.keys()) {
      const beat = beats.get(ref)
      if (beat) {
        elToRef.set(beat, ref)
        observed.push(beat)
      }
    }
    if (observed.length === 0) return

    // Track which anchored beats are currently in the top band of the viewport.
    const intersecting = new Set<Element>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersecting.add(entry.target)
          else intersecting.delete(entry.target)
        }
        if (intersecting.size === 0) return
        // Topmost intersecting anchored beat wins.
        let topEl: Element | null = null
        let topY = Infinity
        for (const node of intersecting) {
          const y = node.getBoundingClientRect().top
          if (y < topY) {
            topY = y
            topEl = node
          }
        }
        if (!topEl) return
        const ref = elToRef.get(topEl)
        const threadId = ref ? refToThread.get(ref) : undefined
        if (!threadId) return
        setActiveThreadId(threadId)
        // Scroll the matching card into the gutter's OWN view (never the window).
        const gutter = gutterRef.current
        const card = gutter?.querySelector<HTMLElement>(`#thread-card-${threadId}`)
        if (gutter && card) {
          gutter.scrollTop = card.offsetTop - gutter.clientHeight / 2 + card.clientHeight / 2
        }
      },
      { root: null, rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    )

    for (const node of observed) observer.observe(node)
    return () => observer.disconnect()
    // Beats are recreated when threads/draftText change; rebuild the observer then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refToThread, draftText])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <aside className="flex flex-col rounded-lg border border-brand-pale-dusk bg-brand-threshold/70 font-sans shadow-sm">
      {/* Header + actions */}
      <div className="flex items-center justify-between border-b border-brand-pale-dusk px-3.5 py-3">
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
          className="rounded-[2px] border border-brand-lavender/40 bg-white px-2.5 py-1 font-sans text-[0.7rem] text-brand-indigo transition-colors hover:bg-brand-pale-dusk hover:text-brand-twilight-mid"
        >
          + General comment
        </button>
      </div>

      {/* Scrollable column — scrolls independently of the page. */}
      <div
        ref={gutterRef}
        className="relative flex flex-col gap-4 p-3.5 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
      >
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
            {visible.map((t) => {
              const isActive = t.root.id === activeThreadId
              const isAnchored = t.root.anchors.length > 0
              const colour = isActive
                ? BADGE_PALETTE[((badges.get(t.root.id)?.num ?? 1) - 1) % BADGE_PALETTE.length]
                : undefined
              return (
                <div
                  key={t.root.id}
                  id={`thread-card-${t.root.id}`}
                  className={`rounded-[3px] transition-shadow ${
                    isActive ? 'ring-2 ring-offset-1 ring-offset-brand-threshold' : ''
                  } ${isAnchored ? 'cursor-pointer' : ''}`}
                  style={isActive && colour ? { boxShadow: `0 0 0 2px ${colour}` } : undefined}
                  onClick={
                    isAnchored
                      ? (e) => {
                          // Don't hijack clicks on interactive children (reply, delete,
                          // status select, the 📌 jump chip — they handle themselves).
                          if ((e.target as HTMLElement).closest('button, a, select, textarea, input')) return
                          handleSelectThread(t.root.id)
                        }
                      : undefined
                  }
                >
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
              )
            })}
          </div>
        ) : (
          !composing && (
            <p className="font-sans text-[0.75rem] text-brand-slate/60">No comments yet.</p>
          )
        )}
      </div>
    </aside>
  )
}

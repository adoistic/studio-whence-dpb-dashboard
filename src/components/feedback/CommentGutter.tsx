'use client'

import { useState, useMemo, useEffect, useRef, type RefObject } from 'react'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { useComicFeedback, addComment, addReply, setStatus, setPublished, editComment, hideComment, deleteComment } from '@/lib/feedback'
import { useComicVersions } from '@/lib/useComicVersions'
import { visibleTo, changedSince, STATUS_COLOR, type Anchor, type Category, type Status } from '@/lib/feedbackTypes'
import { assignBadges } from '@/components/feedback/badges'
import { useCommentTargets } from '@/components/feedback/useCommentTargets'
import { indexUnits } from '@/components/feedback/anchorRef'
import { CommentComposer } from '@/components/feedback/CommentComposer'
import { CommentThread } from '@/components/feedback/CommentThread'

export interface CommentGutterProps {
  comicId: string
  line: string
  comicVersion: number
  scriptRef: RefObject<HTMLElement | null>
  draftText: string | null
}

// Status filter chips, in display order. "Unaddressed" (open + in_progress) is
// on by default; addressed/parked statuses are hidden until toggled on.
const STATUS_FILTERS: { value: Status; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'wont_fix', label: "Won't fix" },
]
const DEFAULT_STATUSES: Status[] = ['open', 'in_progress']

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
  // Moderation (approve/hide/delete-any/status/see-drafts+hidden) is open to
  // admins AND sub-admins; only the read-gate and these controls key off it.
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

  // ── Visibility filter ─────────────────────────────────────────────────────
  const visible = threads.filter((t) => visibleTo(t.root, canMod))
  const badges = assignBadges(visible)

  // ── Status filter ──────────────────────────────────────────────────────────
  // Default to "unaddressed" (open + in_progress). A root with no status counts
  // as `open`. The selection bar, general-comment button, and composer ignore
  // this filter; only the rendered thread list is filtered. Badge numbers stay
  // stable (assigned over `visible`) so a thread keeps its number/colour when
  // revealed by a toggle.
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(() => new Set(DEFAULT_STATUSES))
  const filtered = useMemo(
    () => visible.filter((t) => statusFilter.has(t.root.status ?? 'open')),
    // `visible` is derived fresh each render; key on the stable inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threads, canMod, statusFilter],
  )
  function toggleStatus(s: Status) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  // ── Local state ───────────────────────────────────────────────────────────
  // Select-mode: the reader toggles any number of units (page/panel/beat) in
  // the script, then attaches ONE comment to the whole selection.
  const [selection, setSelection] = useState<Anchor[]>([])
  const [composing, setComposing] = useState(false)
  const [generalComment, setGeneralComment] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

  const selectedRefs = useMemo(() => new Set(selection.map((a) => a.ref)), [selection])

  // The scrollable comment column (independently scrollable from the page).
  const gutterRef = useRef<HTMLDivElement>(null)

  // ── Marker + select affordances on the rendered draft ─────────────────────
  useCommentTargets(scriptRef, visible, draftText, {
    selectedRefs,
    onToggleSelect(anchor) {
      setSelection((prev) =>
        prev.some((a) => a.ref === anchor.ref)
          ? prev.filter((a) => a.ref !== anchor.ref)
          : [...prev, anchor],
      )
    },
    onSelectThread(id) {
      handleSelectThread(id)
    },
    activeThreadId,
  })

  // The anchors handed to the composer: a selection comment carries the picked
  // units; a general comment carries none.
  const composerAnchors = generalComment ? [] : selection

  // ── Computed refs for CommentThread ──────────────────────────────────────
  const knownRefs = useMemo(() => {
    const s = new Set<string>()
    if (draftText)
      for (const re of [/data-beat-ref="([^"]+)"/g, /data-panel-ref="([^"]+)"/g, /data-page-ref="([^"]+)"/g])
        for (const m of draftText.matchAll(re)) s.add(m[1])
    return s
  }, [draftText])

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleCreate(body: string, category?: Category, published?: boolean) {
    await addComment({ comicId, line, anchors: composerAnchors, body, comicVersion, category, published }, author)
    setComposing(false)
    setGeneralComment(false)
    setSelection([])
  }

  function handleCancel() {
    setComposing(false)
    setGeneralComment(false)
  }

  function handleClearSelection() {
    setSelection([])
    setComposing(false)
    setGeneralComment(false)
  }

  function handleRemoveAnchor(ref: string) {
    setSelection((prev) => prev.filter((a) => a.ref !== ref))
  }

  function handleJump(beatRef: string) {
    const el = scriptRef.current ? indexUnits(scriptRef.current).get(beatRef) : null
    // Scroll the PAGE (window) to the anchored beat — block:center.
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Highlight the owning thread.
    const owning = visible.find((t) => t.root.anchors.some((a) => a.ref === beatRef))
    if (owning) setActiveThreadId(owning.root.id)
  }

  // Jump from a comment card → its first anchored beat (page scroll + active).
  function handleSelectThread(threadId: string) {
    const owning = visible.find((t) => t.root.id === threadId)
    const firstRef = owning?.root.anchors[0]?.ref
    if (firstRef) handleJump(firstRef)
    else setActiveThreadId(threadId)
  }

  // ── Scroll-spy: as the reader scrolls, highlight + reveal the matching card ──
  // Maps each anchored beatRef → its threadId so the observer can resolve hits.
  const refToThread = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of visible) {
      for (const a of t.root.anchors) m.set(a.ref, t.root.id)
    }
    return m
    // `visible` is derived fresh each render; key the memo on the stable inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, canMod])

  useEffect(() => {
    const container = scriptRef.current
    if (!container || refToThread.size === 0) return

    const beats = indexUnits(container)
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
      {/* Scrollable column — scrolls independently of the page. The header
          lives INSIDE this scroll container and sticks to its top, so
          "Comments" + the add-comment control stay reachable while the thread
          list scrolls under them. */}
      <div
        ref={gutterRef}
        className="relative flex flex-col gap-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
      >
        {/* Sticky header + actions — matching background so threads scrolling
            under it don't show through, plus a subtle bottom divider. */}
        <div className="sticky top-0 z-10 -mx-px flex flex-col border-b border-brand-pale-dusk bg-brand-threshold">
          <div className="flex items-center justify-between px-3.5 py-3">
            <h2 className="font-sans text-sm font-semibold uppercase tracking-label text-brand-umber">
              Comments
            </h2>
            <button
              type="button"
              onClick={() => {
                setGeneralComment(true)
                setComposing(true)
              }}
              className="rounded-[2px] border border-brand-lavender/40 bg-white px-2.5 py-1 font-sans text-[0.7rem] text-brand-indigo transition-colors hover:bg-brand-pale-dusk hover:text-brand-twilight-mid"
            >
              + General comment
            </button>
          </div>

          {/* Status filter chips — compact, always visible in the sticky header.
              Default shows unaddressed (Open + In progress); toggle to reveal
              addressed/parked threads. Chips wrap on the ~22rem-wide gutter. */}
          <div className="flex flex-wrap items-center gap-1 px-3.5 pb-2.5">
            {STATUS_FILTERS.map(({ value, label }) => {
              const on = statusFilter.has(value)
              const hex = STATUS_COLOR[value].hex
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleStatus(value)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-[0.62rem] font-medium uppercase tracking-label transition-colors ${
                    on
                      ? 'border-brand-indigo bg-brand-indigo text-brand-pale-dusk'
                      : 'border-brand-pale-dusk bg-white text-brand-slate hover:border-brand-lavender/60 hover:text-brand-indigo'
                  }`}
                >
                  {/* Status-colour dot doubles the filter legend as the colour key */}
                  <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: hex }} />
                  {label}
                </button>
              )
            })}
          </div>

          {/* Selection action bar — appears once any unit is selected in the
              script. One unified comment attaches to the whole selection. */}
          {selection.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-brand-pale-dusk bg-brand-pale-dusk/60 px-3.5 py-2">
              <span className="font-sans text-[0.7rem] font-semibold text-brand-indigo">
                {selection.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="rounded-[2px] px-2 py-1 font-sans text-[0.7rem] text-brand-slate transition-colors hover:bg-white hover:text-brand-deep"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGeneralComment(false)
                    setComposing(true)
                  }}
                  className="rounded-[2px] bg-brand-indigo px-3 py-1 font-sans text-[0.7rem] font-semibold text-brand-pale-dusk transition-colors hover:bg-brand-twilight-mid"
                >
                  Comment
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Body — the composer + thread list (padded; the sticky header above
            carries its own padding). */}
        <div className="flex flex-col gap-4 px-3.5 pb-3.5">
        {/* Selection hint when nothing is picked yet and no composer is open */}
        {selection.length === 0 && !composing && (
          <p className="rounded-[2px] bg-brand-pale-dusk/50 px-3 py-2 font-sans text-[0.7rem] text-brand-slate">
            Hover a page, panel, or line in the script and hit{' '}
            <span className="font-semibold text-brand-indigo">＋ Select</span> to attach a comment —
            pick as many as you like for one comment.
          </p>
        )}

        {/* Composer */}
        {composing && (
          <CommentComposer
            mode="comment"
            anchors={composerAnchors}
            onAddAnchor={() => {}}
            hideAddAnchor
            onRemoveAnchor={handleRemoveAnchor}
            onSubmit={handleCreate}
            onCancel={handleCancel}
            canPublishDirectly={canMod}
          />
        )}

        {/* Thread list (status-filtered; badges keyed off the full visible set) */}
        {filtered.length > 0 ? (
          <div className="flex flex-col gap-3">
            {filtered.map((t) => {
              const isActive = t.root.id === activeThreadId
              const isAnchored = t.root.anchors.length > 0
              const colour = isActive ? STATUS_COLOR[t.root.status ?? 'open'].hex : undefined
              return (
                <div
                  key={t.root.id}
                  id={`thread-card-${t.root.id}`}
                  className={`rounded-[3px] transition-shadow ${
                    isActive ? 'ring-offset-1 ring-offset-brand-threshold' : ''
                  } ${isAnchored ? 'cursor-pointer' : 'cursor-default'}`}
                  style={
                    isActive && colour
                      ? {
                          boxShadow: `0 0 0 3px ${colour}, 0 4px 14px color-mix(in srgb, ${colour} 40%, transparent)`,
                        }
                      : undefined
                  }
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
                    onJumpToBeat={handleJump}
                    onApprove={() => setPublished(t.root.id, true, { email: author.email, name: author.name })}
                    onEdit={async (body) => {
                      await editComment(t.root.id, { body })
                    }}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          !composing && (
            <p className="font-sans text-[0.75rem] text-brand-slate/60">
              {visible.length > 0
                ? 'No comments match the current status filter.'
                : 'No comments yet.'}
            </p>
          )
        )}
        </div>
      </div>
    </aside>
  )
}

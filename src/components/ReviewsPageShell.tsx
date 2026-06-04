'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAllRoots } from '@/lib/feedback'
import { useComics } from '@/lib/catalog'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { visibleTo, anchorLabel, type Anchor, type Status } from '@/lib/feedbackTypes'
import { CommentIcon, PinIcon } from '@/components/feedback/icons'

// ── Types ──────────────────────────────────────────────────────────────────────

type StatusFilter = Status | 'all'

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'wont_fix', label: "Won't fix" },
]

const STATUS_DOT: Record<Status, string> = {
  open: 'bg-brand-gold',
  in_progress: 'bg-brand-lavender',
  resolved: 'bg-brand-indigo',
  deferred: 'bg-brand-slate',
  wont_fix: 'bg-brand-slate/50',
}

const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  deferred: 'Deferred',
  wont_fix: "Won't fix",
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// comicId is `{line}__{slug}` — derive the comic path from it directly so the
// deep-link never depends on the stored `line` field (an empty line would make
// the URL protocol-relative, `//comicId`, which the browser reads as a hostname).
function comicPath(comicId: string): string {
  const i = comicId.indexOf('__')
  return i >= 0 ? `/${comicId.slice(0, i)}/${comicId.slice(i + 2)}` : `/${comicId}`
}

function anchorSummary(anchors: Anchor[]) {
  if (anchors.length === 0)
    return (
      <>
        <CommentIcon className="h-3 w-3" /> general
      </>
    )
  if (anchors.length === 1)
    return (
      <>
        <PinIcon className="h-3 w-3" /> {anchorLabel(anchors[0])}
      </>
    )
  return (
    <>
      <PinIcon className="h-3 w-3" /> {anchors.length} places
    </>
  )
}

function truncate(text: string, max = 140): string {
  return text.length <= max ? text : text.slice(0, max).trimEnd() + '…'
}

// ── Chip button ────────────────────────────────────────────────────────────────

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center rounded-full border px-3 py-1 font-sans text-[0.7rem] uppercase tracking-label transition-colors',
        active
          ? 'border-brand-indigo bg-brand-indigo text-brand-cream'
          : 'border-brand-pale-dusk bg-brand-pale-dusk/30 text-brand-umber hover:border-brand-indigo/50 hover:bg-brand-pale-dusk/60',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ReviewsPageShell() {
  // Identity
  const { user, loading: authLoading } = useUser()
  const status_raw = useAllowStatus(user ?? null, authLoading)
  // Moderators (admin + sub_admin) read every root (drafts + hidden); members
  // get only published, non-hidden via the gated query.
  const canMod = canModerate(status_raw)
  const currentEmail = user?.email ?? ''

  // Data
  const { data: roots, loading } = useAllRoots(canMod)
  const { data: comics } = useComics()

  // Build comic title map: `${line}__${slug}` → title
  const titleByComicId = new Map(comics?.map((c) => [`${c.line}__${c.slug}`, c.title]) ?? [])

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [mine, setMine] = useState(false)
  const [anchoredOnly, setAnchoredOnly] = useState(false)

  // Apply filters
  const filtered = (roots ?? [])
    .filter((r) => visibleTo(r, canMod))
    .filter((r) => statusFilter === 'all' || r.status === statusFilter)
    .filter((r) => !mine || r.authorEmail === currentEmail)
    .filter((r) => !anchoredOnly || r.anchors.length > 0)

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-24 pt-12">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-10">
        <span className="flex items-center gap-3">
          <span aria-hidden className="block h-px w-7 bg-brand-gold" />
          <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
            Feedback · All comics
          </span>
        </span>
        <h1 className="mt-4 font-serif font-light leading-tight text-brand-umber text-[2rem] md:text-[2.8rem]">
          Reviews
        </h1>
        <p className="mt-2 max-w-xl font-serif text-brand-umber/70 leading-relaxed">
          All top-level feedback across every comic, newest first.
        </p>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map(({ value, label }) => (
          <Chip
            key={value}
            label={label}
            active={statusFilter === value}
            onClick={() => setStatusFilter(value)}
          />
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-brand-pale-dusk" />
        <Chip label="Mine" active={mine} onClick={() => setMine((v) => !v)} />
        <Chip label="Anchored" active={anchoredOnly} onClick={() => setAnchoredOnly((v) => !v)} />
      </div>

      {/* ── List ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-16 text-center font-sans text-sm text-brand-slate">
          Loading feedback…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center font-sans text-sm text-brand-slate">
          No feedback matches.
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {filtered.map((r) => {
            const href = `${comicPath(r.comicId)}#feedback-${r.id}`
            const title = titleByComicId.get(r.comicId) ?? r.comicId
            const nodeStatus = r.status ?? 'open'

            return (
              <li key={r.id}>
                <Link
                  href={href}
                  className="group flex flex-col gap-1.5 rounded-lg border border-brand-pale-dusk bg-brand-pale-dusk/20 px-5 py-4 transition-colors hover:border-brand-indigo/30 hover:bg-brand-pale-dusk/40"
                >
                  {/* Row 1: comic title + anchor summary + status */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-sans text-[0.68rem] uppercase tracking-label text-brand-indigo">
                      {title}
                    </span>
                    <span className="inline-flex items-center gap-1 font-sans text-[0.65rem] text-brand-slate">
                      {anchorSummary(r.anchors)}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-brand-pale-dusk bg-brand-pale-dusk/40 px-2 py-0.5">
                      <span
                        aria-hidden
                        className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[nodeStatus] ?? 'bg-brand-slate'}`}
                      />
                      <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-umber">
                        {STATUS_LABEL[nodeStatus] ?? nodeStatus}
                      </span>
                    </span>
                  </div>

                  {/* Row 2: body */}
                  <p className="font-serif text-sm leading-snug text-brand-umber group-hover:text-brand-indigo transition-colors">
                    {truncate(r.body)}
                  </p>

                  {/* Row 3: author */}
                  <p className="font-sans text-[0.65rem] text-brand-slate">
                    {r.authorName || r.authorEmail}
                  </p>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

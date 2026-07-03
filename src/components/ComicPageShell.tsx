'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { Comic } from '@/types/content'
import { StatusPill } from '@/components/StatusPill'
import { SectionHead } from '@/components/SectionHead'
import { VersionTimeline } from '@/components/feedback/VersionTimeline'
import { DocumentsPanel } from '@/components/DocumentsPanel'
import { LanguageSection } from '@/components/LanguageSection'
import { CoverOptions } from '@/components/CoverOptions'
import { InsideCovers } from '@/components/InsideCovers'
import { BackCover } from '@/components/BackCover'
import { Activities } from '@/components/Activities'
import { AboutTheBook } from '@/components/AboutTheBook'
import { ComicReader } from '@/components/ComicReader'
import { ComicPdfButton } from '@/components/ComicPdfButton'
import { ComicPptButton } from '@/components/ComicPptButton'
import { ComicCmykButton } from '@/components/ComicCmykButton'
import { ComicDocxButton } from '@/components/ComicDocxButton'
import { AmazonModulesPanel } from '@/components/AmazonModulesPanel'
import { useGatedText } from '@/lib/useGatedText'
import { useFigure } from '@/lib/catalog'
import { useVisibleComics } from '@/lib/visibleCatalog'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { normalizeSubjectSlug } from '@/lib/slugs'
import { citationMapFromSources } from '@/lib/provenance'
import { PersonTabs } from '@/components/PersonTabs'
import { ComicEditions } from '@/components/ComicEditions'
import { useProvenanceMarkers } from '@/lib/useProvenanceMarkers'
import { ProvenanceTooltip } from '@/components/ProvenanceTooltip'
import { CommentGutter } from '@/components/feedback/CommentGutter'
import { CommentsView } from '@/components/feedback/CommentsView'
import { CopyScriptToolbar } from '@/components/feedback/CopyScriptToolbar'
import { indexUnits } from '@/components/feedback/anchorRef'
import { PageCommentsPanel } from '@/components/feedback/PageCommentsPanel'
import { useComicFeedback } from '@/lib/feedback'
import { visibleTo } from '@/lib/feedbackTypes'
import { countThreadsByPage } from '@/lib/readerPages'

// Memoized so tooltip-state re-renders of ComicPageShell don't re-parse the
// draft. React 19 recreates dangerouslySetInnerHTML child nodes on every host
// re-render even when __html is identical; memoizing on the HTML string keeps
// the marker nodes stable across hovers (no re-parse, no jank).
const DraftScript = memo(function DraftScript({
  html,
  innerRef,
}: {
  html: string
  innerRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    // SAFE INJECTION: drafts/** bytes are produced solely by the content
    // pipeline's render_draft_html (markdown → bleach.clean strict allow-list),
    // i.e. first-party AND server-sanitized (XSS-clean). This is the only
    // dangerouslySetInnerHTML in the app. If the draft render pipeline ever
    // stops sanitizing, this injection must be revisited.
    <div
      ref={innerRef}
      className="comic-script font-serif text-brand-umber leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-serif text-brand-indigo text-lg leading-tight">{value}</span>
      <span className="font-sans text-[0.66rem] uppercase tracking-label text-brand-slate">{label}</span>
    </div>
  )
}


export function ComicPageShell({ comic }: { comic: Comic }) {
  const draft = useGatedText(`drafts/${comic.line}/${comic.slug}.html`)

  const scriptRef = useRef<HTMLDivElement>(null)
  const figureSlug = normalizeSubjectSlug(comic.subject_slug)
  const fig = useFigure(figureSlug)
  // Sibling/peer comics for PersonTabs. A member with only a single-comic grant
  // cannot scan `subject_slug ==` (the rules would reject any sibling they're not
  // allocated), so read the viewer's visible set and filter to this subject.
  // Moderators see every sibling; members see only the readable ones (degrades to
  // an empty peer list, never an error).
  const { user, loading: authLoading } = useUser()
  const status = useAllowStatus(user, authLoading)
  const canMod = canModerate(status)
  const email = user?.email ?? null
  const peopleComics = useVisibleComics(canMod, email)
  const citationMap = useMemo(
    () => citationMapFromSources(fig.data?.sources ?? []),
    [fig.data],
  )
  const tip = useProvenanceMarkers(scriptRef, citationMap, draft.text)
  // A subject's research/comics tabs show whenever a figure doc actually exists
  // for it — biographies figures and Practical Indic subjects (e.g. swami-ramdev)
  // alike. The indic epics have no figure doc, so fig.data stays falsy for them.
  const hasFigure = !!figureSlug && !!fig.data

  // ── Comic PDF ⇄ A+ Modules view ──────────────────────────────────────────
  // The "Read the comic" section toggles between the page reader (PDF) and the
  // comic's Amazon A+ marketing modules, when both are present.
  const hasPages = !!comic.pages?.hasPages
  const hasModules = (comic.amazonModules?.images?.length ?? 0) > 0
  const [comicView, setComicView] = useState<'pages' | 'modules'>(
    hasPages ? 'pages' : 'modules',
  )

  // ── Draft ⇄ Comments view ────────────────────────────────────────────────
  const [view, setView] = useState<'draft' | 'comments'>('draft')
  // When a comment in the Comments view is clicked, switch to the Draft view and
  // remember which beat to scroll to once it's mounted.
  const [pendingJumpRef, setPendingJumpRef] = useState<string | null>(null)

  // ── Page-level comments on the READER ─────────────────────────────────────
  // The reader and the script share page numbering, so reader comments anchor
  // to the same `pN` refs the draft view uses. The drawer is scoped to one page.
  const comicId = `${comic.line}__${comic.slug}`
  const [commentPage, setCommentPage] = useState<number | null>(null)
  const { data: fbThreads } = useComicFeedback(comicId, canMod)
  const pageCounts = useMemo(
    () => countThreadsByPage(fbThreads.filter((t) => visibleTo(t.root, canMod))),
    [fbThreads, canMod],
  )

  function jumpInDraft(ref: string) {
    setView('draft')
    setPendingJumpRef(ref)
  }

  // After the draft view mounts (or the draft html changes), scroll the pending
  // beat into view. The ref is read here in the EFFECT, never during render.
  useEffect(() => {
    if (view !== 'draft' || !pendingJumpRef) return
    const root = scriptRef.current
    if (!root) return
    const el = indexUnits(root).get(pendingJumpRef)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setPendingJumpRef(null)
  }, [view, pendingJumpRef, draft.text])

  const comics = (peopleComics.data ?? [])
    .filter((c) => c.subject_slug === figureSlug)
    .map((c) => ({
      slug: c.slug,
      line: c.line,
      title: c.title,
      status: c.status,
      comic_number: c.comic_number,
      target_length_pages: c.target_length_pages,
    }))

  const seriesLine = [comic.series, comic.comic_number ? `Comic ${comic.comic_number}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div>
      {/* ── Masthead ───────────────────────────────────────────────── */}
      <section className="surface-deep grain relative overflow-hidden">
        <div className="relative mx-auto max-w-[1100px] px-6 py-14 md:py-16">
          {comic.subject && (
            hasFigure ? (
              <Link
                href={`/figures/${figureSlug}`}
                className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold transition-opacity hover:opacity-70"
              >
                {comic.subject}
              </Link>
            ) : (
              <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
                {comic.subject}
              </span>
            )
          )}
          <h1 className="mt-4 font-serif font-light leading-[1.0] text-brand-cream text-[2.1rem] md:text-[3rem]">
            {comic.title}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <StatusPill status={comic.status} />
            {seriesLine && (
              <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/70">
                {seriesLine}
              </span>
            )}
          </div>
          {comic.logline && (
            <p className="mt-5 max-w-2xl font-serif text-lg leading-relaxed text-brand-pale-dusk/80">
              {comic.logline}
            </p>
          )}
        </div>
      </section>

      {/* ── Person tabs (Research ⇄ Comics) — biographies w/ a figure only ── */}
      {hasFigure && (
        <PersonTabs figureSlug={figureSlug} comics={comics} active="comics" />
      )}

      {/* ── Body ───────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1100px] px-6">
        {/* Editions band — prominent in the body so it isn't missed (it used to
            be crammed into the tab strip right under the masthead). */}
        <ComicEditions comics={comics} activeSlug={comic.slug} />

        {/* Spec row — only present fields render */}
        <div className="mt-12 flex flex-wrap gap-x-12 gap-y-7 border-t border-brand-pale-dusk pt-10">
          {comic.time_span && <Detail label="time span" value={comic.time_span} />}
          {comic.target_length_pages != null && <Detail label="pages" value={comic.target_length_pages} />}
          {comic.target_age && <Detail label="target age" value={comic.target_age} />}
          {comic.narrator && <Detail label="narrator" value={comic.narrator} />}
          {comic.sources_count != null && <Detail label="sources" value={comic.sources_count} />}
          {/* Toddlers-specific extras */}
          {comic.imprint && <Detail label="imprint" value={comic.imprint} />}
          {comic.format && <Detail label="format" value={comic.format} />}
          {comic.art_style && <Detail label="art style" value={comic.art_style} />}
          {comic.language && <Detail label="language" value={comic.language} />}
        </div>

        {/* Version history timeline */}
        <VersionTimeline changelog={comic.changelog ?? []} version={comic.version} />

        {/* Client-facing documents (concept-note, sources-and-quotes, …) —
            renders nothing unless the catalog published a docs manifest. */}
        <div className="mt-16">
          <DocumentsPanel comic={comic} />
        </div>

        {/* Cover options — candidate front covers for the team to review/choose.
            Renders nothing unless the catalog published a coverOptions block. */}
        <div className="mt-16">
          <CoverOptions
            comic={comic}
            canModerate={canMod}
            author={{ email: user?.email ?? '', name: user?.displayName ?? user?.email ?? '' }}
          />
          <InsideCovers comic={comic} />
          <BackCover comic={comic} />
          <Activities comic={comic} />
          <AboutTheBook comic={comic} />
        </div>

        {/* Translated editions (Hindi / English) — translated script + editable
            .pptx and/or blank-version PDF. Renders nothing unless the catalog
            published a translations[] block. */}
        <div className="mt-16">
          <LanguageSection comic={comic} />
        </div>

        {/* Read the comic — the page reader (PDF) and/or the Amazon A+ modules.
            Renders when either has been published; a sub-tab toggles between
            them when both are present. */}
        {(hasPages || hasModules) && (
          <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHead kicker="The comic" title="Read the comic" />
              <div className="flex flex-wrap items-center gap-3">
                {/* Comic PDF ⇄ A+ Modules tab toggle — only when both exist */}
                {hasPages && hasModules && (
                  <div
                    role="tablist"
                    aria-label="Comic view"
                    className="inline-flex items-center gap-0.5 rounded-full border border-brand-pale-dusk bg-brand-threshold/70 p-0.5 font-sans"
                  >
                    {([
                      { key: 'pages', label: 'Comic PDF' },
                      { key: 'modules', label: 'A+ Modules' },
                    ] as const).map(({ key, label }) => {
                      const active = comicView === key
                      return (
                        <button
                          key={key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setComicView(key)}
                          className={`rounded-full px-4 py-1.5 font-sans text-[0.72rem] font-semibold uppercase tracking-label transition-colors ${
                            active
                              ? 'bg-brand-indigo text-brand-pale-dusk shadow-sm'
                              : 'text-brand-slate hover:text-brand-indigo'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                )}
                {/* Download buttons belong to the page reader */}
                {comicView === 'pages' && hasPages && (
                  <>
                    <ComicPdfButton comic={comic} />
                    <ComicPptButton comic={comic} />
                    <ComicCmykButton comic={comic} />
                  </>
                )}
              </div>
            </div>
            {comicView === 'pages' && hasPages ? (
              <ComicReader comic={comic} pageCounts={pageCounts} onCommentPage={setCommentPage} />
            ) : (
              <AmazonModulesPanel comic={comic} />
            )}
          </section>
        )}

        {/* Page-scoped comments drawer (opened from the reader) */}
        {commentPage != null && (
          <PageCommentsPanel
            comicId={comicId}
            line={comic.line}
            comicVersion={comic.version ?? 0}
            page={commentPage}
            draftText={draft.text}
            onJumpInDraft={jumpInDraft}
            onClose={() => setCommentPage(null)}
          />
        )}

        {/* Script reader */}
        <section className="flex flex-col gap-6 pb-24 pt-16">
          <SectionHead kicker="The script" title="Read the draft" />
          {draft.loading ? (
            <p role="status" className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
              Loading the script…
            </p>
          ) : draft.text ? (
            <>
            {/* Reader header — the copy toolbar + the Draft/Comments view tab
                read as one bar; the toolbar stays visible in BOTH views. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* View tab toggle */}
              <div
                role="tablist"
                aria-label="Reader view"
                className="inline-flex items-center gap-0.5 rounded-full border border-brand-pale-dusk bg-brand-threshold/70 p-0.5 font-sans"
              >
                {([
                  { key: 'draft', label: 'Draft' },
                  { key: 'comments', label: 'Comments' },
                ] as const).map(({ key, label }) => {
                  const active = view === key
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setView(key)}
                      className={`rounded-full px-4 py-1.5 font-sans text-[0.72rem] font-semibold uppercase tracking-label transition-colors ${
                        active
                          ? 'bg-brand-indigo text-brand-pale-dusk shadow-sm'
                          : 'text-brand-slate hover:text-brand-indigo'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {draft.text && <ComicDocxButton comic={comic} draftHtml={draft.text} />}
                <CopyScriptToolbar
                  comicId={`${comic.line}__${comic.slug}`}
                  comicTitle={comic.title}
                  draftText={draft.text}
                />
              </div>
            </div>

            {view === 'draft' ? (
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
              {/* The script column — each cs-page renders as its own paper
                  sheet (styled in globals.css), so the muted app background
                  shows between sheets and the page structure is obvious. */}
              <div className="min-w-0 flex-1">
                <div className="mx-auto max-w-[760px]">
                  <DraftScript html={draft.text} innerRef={scriptRef} />
                  {tip && <ProvenanceTooltip {...tip} />}
                </div>
              </div>
              {/* The comment margin — sticky beside the page, scrolls on its own.
                  top-20 (80px) clears the ~60px sticky Topbar (z-40) + a small gap
                  so the gutter's own sticky "Comments" header isn't hidden behind it. */}
              <aside className="lg:sticky lg:top-20 lg:w-[22rem] lg:shrink-0">
                <CommentGutter
                  comicId={`${comic.line}__${comic.slug}`}
                  line={comic.line}
                  comicVersion={comic.version ?? 0}
                  scriptRef={scriptRef}
                  draftText={draft.text}
                />
              </aside>
            </div>
            ) : (
              <CommentsView
                comicId={`${comic.line}__${comic.slug}`}
                line={comic.line}
                comicVersion={comic.version ?? 0}
                draftText={draft.text}
                onJumpInDraft={jumpInDraft}
              />
            )}
            </>
          ) : (
            <p className="font-serif italic text-brand-slate">Draft not available yet.</p>
          )}
        </section>
      </main>
    </div>
  )
}

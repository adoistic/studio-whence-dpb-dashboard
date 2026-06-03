'use client'

import { memo, useMemo, useRef } from 'react'
import Link from 'next/link'
import type { Comic, ChangelogEntry } from '@/types/content'
import { StatusPill } from '@/components/StatusPill'
import { SectionHead } from '@/components/SectionHead'
import { useGatedText } from '@/lib/useGatedText'
import { useFigure, useComics } from '@/lib/catalog'
import { normalizeSubjectSlug } from '@/lib/slugs'
import { citationMapFromSources } from '@/lib/provenance'
import { PersonTabs } from '@/components/PersonTabs'
import { useProvenanceMarkers } from '@/lib/useProvenanceMarkers'
import { ProvenanceTooltip } from '@/components/ProvenanceTooltip'

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
      className="comic-script max-w-2xl font-serif text-brand-umber leading-relaxed"
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

function changelogText(entry: ChangelogEntry): { date?: string; note: string } {
  return typeof entry === 'string' ? { note: entry } : { date: entry.date, note: entry.note }
}

export function ComicPageShell({ comic }: { comic: Comic }) {
  const draft = useGatedText(`drafts/${comic.line}/${comic.slug}.html`)

  const scriptRef = useRef<HTMLDivElement>(null)
  const figureSlug = normalizeSubjectSlug(comic.subject_slug)
  const fig = useFigure(figureSlug)
  const peopleComics = useComics({ subject_slug: figureSlug })
  const citationMap = useMemo(
    () => citationMapFromSources(fig.data?.sources ?? []),
    [fig.data],
  )
  const tip = useProvenanceMarkers(scriptRef, citationMap, draft.text)
  const hasFigure = comic.line === 'biographies' && !!figureSlug && !!fig.data

  const comics = (peopleComics.data ?? []).map((c) => ({
    slug: c.slug,
    line: c.line,
    title: c.title,
    status: c.status,
    comic_number: c.comic_number,
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
        <PersonTabs figureSlug={figureSlug} comics={comics} active="comics" activeComicSlug={comic.slug} />
      )}

      {/* ── Body ───────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1100px] px-6">
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

        {/* Changelog timeline */}
        {comic.changelog && comic.changelog.length > 0 && (
          <section className="flex flex-col gap-6 pt-16">
            <SectionHead kicker="History" title="Changelog" />
            <ul className="flex flex-col gap-3">
              {comic.changelog.map((entry, i) => {
                const { date, note } = changelogText(entry)
                return (
                  <li key={i} className="flex gap-3 font-serif text-brand-umber leading-relaxed">
                    {date && <span className="shrink-0 tabular-nums text-brand-slate text-sm">{date}</span>}
                    <span>{note}</span>
                  </li>
                )
              })}
            </ul>
          </section>
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
              <DraftScript html={draft.text} innerRef={scriptRef} />
              {tip && <ProvenanceTooltip {...tip} />}
            </>
          ) : (
            <p className="font-serif italic text-brand-slate">Draft not available yet.</p>
          )}
        </section>
      </main>
    </div>
  )
}

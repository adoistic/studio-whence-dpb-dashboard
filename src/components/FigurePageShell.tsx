'use client'

import { useState } from 'react'
import type { Figure } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'
import { ResearchReader } from '@/components/ResearchReader'
import { VariationGallery } from '@/components/VariationGallery'

// Subject sub-part source kinds (Indic characters + future original IP): the
// dossier, the design bible, and the characterization render as research
// alongside (or instead of) the biographies-style books/transcripts.
const SUBPART_KINDS = new Set(['character-dossier', 'design-bible', 'characterization'])
import { AiConversations } from '@/components/AiConversations'
import { PersonTabs } from '@/components/PersonTabs'
import { useVisibleComics } from '@/lib/visibleCatalog'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'

function titleCaseSlug(slug: string): string {
  return slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

/**
 * Build the R2 read key for a selected research leaf.
 *
 * Biography source paths are repo-relative (`biographies/01-…/_books/…/01.md`)
 * and live under the `research/` read-prefix, so they get `research/` prepended.
 * Medicomics dossier paths are already FULL R2 keys (`docs/research/medicomics/
 * autism/…/source.md`); when a path already begins with a known read-prefix
 * (`docs/`, `research/`, `artifacts/`) it is used verbatim.
 */
export function researchKey(path: string | null): string | null {
  if (path === null) return null
  const ABSOLUTE_PREFIXES = ['docs/', 'research/', 'artifacts/']
  if (ABSOLUTE_PREFIXES.some((prefix) => path.startsWith(prefix))) return path
  return `research/${path}`
}

// A selectable research leaf (a chapter file or a podcast transcript).
function FileItem({
  label, active, onSelect,
}: { label: string; active: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        className={`block w-full rounded-sm border-l-2 py-1 pr-2 text-left font-sans text-[0.72rem] tracking-label transition-colors ${
          active
            ? 'border-brand-gold bg-brand-pale-dusk/60 pl-[10px] font-medium text-brand-indigo'
            : 'border-transparent pl-3 text-brand-slate hover:bg-brand-pale-dusk/40 hover:text-brand-indigo'
        }`}
      >
        {label}
      </button>
    </li>
  )
}

// A collapsible group header (a book, or the "Podcasts" bucket) + its children.
function CollapsibleGroup({
  title, meta, open, onToggle, hasActive, children,
}: {
  title: string
  meta: string
  open: boolean
  onToggle: () => void
  hasActive: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex items-start gap-2 text-left">
        <span
          aria-hidden
          className="mt-[3px] inline-block text-[0.6rem] text-brand-slate transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
        >
          ▶
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="font-serif leading-snug text-brand-indigo">{title}</span>
            {!open && hasActive && (
              <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gold" />
            )}
          </span>
          <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">{meta}</span>
        </span>
      </button>
      {open && (
        <ul className="ml-[7px] flex flex-col gap-1 border-l border-brand-pale-dusk pl-1">{children}</ul>
      )}
    </div>
  )
}

export function FigurePageShell({
  figure,
  initialFile = null,
  targetLine,
}: {
  figure: Figure
  initialFile?: string | null
  targetLine?: number
}) {
  const sources = figure.sources ?? []
  const subparts = sources.filter((s) => SUBPART_KINDS.has(s.kind))
  const books = sources.filter((s) => s.kind === 'book')
  const transcripts = sources.filter((s) => s.kind === 'transcript')
  // Default the reader to the design bible (Subjects), else the first dossier
  // sub-part, else the first book — so the panel is never blank on first load.
  const defaultFile =
    initialFile
    ?? subparts.find((s) => s.kind === 'design-bible')?.files[0]?.path
    ?? subparts[0]?.files[0]?.path
    ?? books[0]?.files[0]?.path
    ?? null
  const [selected, setSelected] = useState<string | null>(defaultFile)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))

  // A member who reached this figure via a single-COMIC grant can read the
  // figure's research (figures_effective) but not necessarily all its comics, so
  // a `subject_slug ==` scan could be rejected. Read the viewer's full visible
  // set and filter to this figure — moderators still see every comic.
  const { user, loading: authLoading } = useUser()
  const status = useAllowStatus(user, authLoading)
  const canMod = canModerate(status)
  const email = user?.email ?? null
  const visibleComics = useVisibleComics(canMod, email)
  const comics = (visibleComics.data ?? [])
    .filter((c) => c.subject_slug === figure.slug)
    .map((c) => ({
      slug: c.slug, line: c.line, title: c.title, status: c.status,
      comic_number: c.comic_number, target_length_pages: c.target_length_pages,
    }))

  return (
    <div>
      {/* ── Masthead ───────────────────────────────────────────────── */}
      <section className="surface-deep grain relative overflow-hidden">
        <div className="relative mx-auto max-w-[1100px] px-6 py-14 md:py-16">
          <h1 className="font-serif font-light leading-[1.0] text-brand-cream text-[2.1rem] md:text-[3rem]">
            {titleCaseSlug(figure.slug)}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-10 gap-y-3">
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/70">
              {figure.series}
            </span>
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
              {figure.sources_count} sources · {figure.words.toLocaleString()} words
            </span>
          </div>
        </div>
      </section>

      {/* ── Person tabs (Research ⇄ Comics) ─────────────────────────── */}
      <PersonTabs figureSlug={figure.slug} comics={comics} active="research" />

      {/* ── Body ───────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1100px] px-6">
        {/* Design turnarounds (Subjects with locked variations) — the visual
            payoff above the dossier reader. */}
        {(figure.variations?.length ?? 0) > 0 && (
          <div className="pt-12">
            <VariationGallery variations={figure.variations!} />
          </div>
        )}
        <div className="grid gap-12 pt-12 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:items-start">
          {/* Sources index — sticky on desktop; scrolls internally if long */}
          <section className="flex flex-col gap-6 md:sticky md:top-24 md:max-h-[calc(100vh-7rem)] md:self-start md:overflow-y-auto md:pr-1">
            <SectionHead kicker="The dossier" title="Sources" />
            {sources.length === 0 ? (
              <p className="font-serif italic text-brand-slate">No sources indexed.</p>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Design & dossier — the Subject sub-parts (dossier, design bible,
                    characterization) as one group, listed first for Indic/IP subjects. */}
                {subparts.length > 0 && (
                  <CollapsibleGroup
                    title="Design & dossier"
                    meta={`${subparts.length} ${subparts.length === 1 ? 'document' : 'documents'}`}
                    open={!collapsed['__subparts']}
                    onToggle={() => toggle('__subparts')}
                    hasActive={subparts.some((s) => s.files.some((f) => f.path === selected))}
                  >
                    {subparts.map((s) => {
                      const file = s.files[0]
                      if (!file) return null
                      return (
                        <FileItem
                          key={s.slug}
                          label={s.title}
                          active={selected === file.path}
                          onSelect={() => setSelected(file.path)}
                        />
                      )
                    })}
                  </CollapsibleGroup>
                )}

                {/* Books — each its own collapsible group of chapters */}
                {books.map((book) => (
                  <CollapsibleGroup
                    key={book.slug}
                    title={book.title}
                    meta={`book · ${book.words.toLocaleString()} words`}
                    open={!collapsed[book.slug]}
                    onToggle={() => toggle(book.slug)}
                    hasActive={book.files.some((f) => f.path === selected)}
                  >
                    {book.files.map((file) => (
                      <FileItem
                        key={file.path}
                        label={file.title}
                        active={selected === file.path}
                        onSelect={() => setSelected(file.path)}
                      />
                    ))}
                  </CollapsibleGroup>
                ))}

                {/* Podcasts — all transcripts under one collapsible bucket */}
                {transcripts.length > 0 && (
                  <CollapsibleGroup
                    title="Podcasts"
                    meta={`${transcripts.length} ${transcripts.length === 1 ? 'transcript' : 'transcripts'}`}
                    open={!collapsed['__podcasts']}
                    onToggle={() => toggle('__podcasts')}
                    hasActive={transcripts.some((t) => t.files.some((f) => f.path === selected))}
                  >
                    {transcripts.map((t) => {
                      const file = t.files[0]
                      if (!file) return null
                      return (
                        <FileItem
                          key={t.slug}
                          label={t.title}
                          active={selected === file.path}
                          onSelect={() => setSelected(file.path)}
                        />
                      )
                    })}
                  </CollapsibleGroup>
                )}
              </div>
            )}
          </section>

          {/* Reader panel */}
          <section className="flex flex-col gap-6 pb-24">
            <SectionHead kicker="Read" title="Research" />
            <ResearchReader
              fileKey={researchKey(selected)}
              targetLine={selected === initialFile ? targetLine : undefined}
            />

            {/* Attached AI conversation(s) — self-hides when there are none, so
                non-medicomics figures show nothing extra (the heading rides
                inside the component and hides with it). */}
            <AiConversations
              line={figure.line ?? ''}
              figureSlug={figure.slug}
              heading={{ kicker: 'Reference', title: 'AI conversation' }}
            />
          </section>
        </div>
      </main>
    </div>
  )
}

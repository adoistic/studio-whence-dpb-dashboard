'use client'

import { useMemo, useState } from 'react'
import type { Figure, ResearchSource } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'
import { ResearchReader } from '@/components/ResearchReader'
import { VariationGallery } from '@/components/VariationGallery'
import { WorkCharacters } from '@/components/WorkCharacters'
import { mergeCasts } from '@/lib/castModel'
import { useSubjectCasts } from '@/lib/casts'
import { formatBytes, type ZipProgress } from '@/lib/downloads'
import {
  downloadFigurePdf,
  downloadFigureResearch,
  downloadFilePdf,
  downloadResearchFile,
  downloadSourceMarkdown,
  downloadSourcePdf,
  downloadSourceZip,
  figureName,
  figurePdf,
  figureZipIsCurrent,
  filePdfKey,
  researchKeyOf,
  sourceBundleIsCurrent,
  sourcePdf,
} from '@/lib/researchDownloads'

// Subject sub-part source kinds (Indic characters + future original IP): the
// dossier, the design bible, and the characterization render as research
// alongside (or instead of) the biographies-style books/transcripts.
const SUBPART_KINDS = new Set(['character-dossier', 'design-bible', 'characterization'])
import { AiConversations } from '@/components/AiConversations'
import { PersonTabs } from '@/components/PersonTabs'
import { useVisibleComics } from '@/lib/visibleCatalog'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'

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
  return researchKeyOf(path)
}

const ICON_BTN =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded text-brand-slate transition-colors hover:bg-brand-pale-dusk/60 hover:text-brand-indigo disabled:opacity-40'
const CHIP =
  'rounded border border-brand-pale-dusk px-1.5 py-0.5 font-sans text-[0.58rem] uppercase tracking-label text-brand-slate transition-colors hover:border-brand-indigo hover:text-brand-indigo disabled:opacity-40'
const PDF_MINI =
  'flex h-6 shrink-0 items-center justify-center rounded px-1.5 font-sans text-[0.55rem] font-semibold uppercase tracking-label text-brand-slate transition-colors hover:bg-brand-pale-dusk/60 hover:text-brand-indigo disabled:opacity-40'

function DownloadGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M2.5 12.5h11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// A selectable research leaf (a chapter file or a podcast transcript), with its own
// downloads beside it: the Markdown, and the typeset PDF when one is built.
function FileItem({
  label, active, onSelect, onDownload, onPdf,
}: { label: string; active: boolean; onSelect: () => void; onDownload?: () => void; onPdf?: () => void }) {
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        className={`block min-w-0 flex-1 rounded-sm border-l-2 py-1 pr-2 text-left font-sans text-[0.72rem] tracking-label transition-colors ${
          active
            ? 'border-brand-gold bg-brand-pale-dusk/60 pl-[10px] font-medium text-brand-indigo'
            : 'border-transparent pl-3 text-brand-slate hover:bg-brand-pale-dusk/40 hover:text-brand-indigo'
        }`}
      >
        {label}
      </button>
      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          aria-label={`Download ${label}`}
          title="Download as Markdown"
          className={`${ICON_BTN} md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100`}
        >
          <DownloadGlyph />
        </button>
      )}
      {onPdf && (
        <button
          type="button"
          onClick={onPdf}
          aria-label={`Download ${label} as PDF`}
          title="Download as a typeset PDF"
          className={`${PDF_MINI} md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100`}
        >
          PDF
        </button>
      )}
    </li>
  )
}

// A collapsible group header (a book, or the "Podcasts" bucket) + its children,
// with optional download actions beside the title.
function CollapsibleGroup({
  title, meta, open, onToggle, hasActive, actions, children,
}: {
  title: string
  meta: string
  open: boolean
  onToggle: () => void
  hasActive: boolean
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <span
            aria-hidden
            className="mt-[3px] inline-block text-[0.6rem] text-brand-slate transition-transform duration-200"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          >
            ▶
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="font-serif leading-snug text-brand-indigo">{title}</span>
              {!open && hasActive && (
                <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gold" />
              )}
            </span>
            <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">{meta}</span>
          </span>
        </button>
        {actions && <div className="flex shrink-0 items-center gap-1 pt-0.5">{actions}</div>}
      </div>
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
  const [tab, setTab] = useState<'research' | 'characters'>('research')

  // A member who reached this figure via a single-COMIC grant can read the
  // figure's research (figures_effective) but not necessarily all its comics, so
  // a `subject_slug ==` scan could be rejected. Read the viewer's full visible
  // set and filter to this figure — moderators still see every comic.
  const { user, loading: authLoading } = useUser()
  const status = useAllowStatus(user, authLoading)
  const canMod = canModerate(status)
  const email = user?.email ?? null
  const visibleComics = useVisibleComics(canMod, email)
  const mine = (visibleComics.data ?? []).filter((c) => c.subject_slug === figure.slug)
  const comics = mine.map((c) => ({
    slug: c.slug, line: c.line, title: c.title, status: c.status,
    comic_number: c.comic_number, target_length_pages: c.target_length_pages,
  }))

  // The cast of this subject's books (one small read per book), so the tab can say
  // how many characters there are before anyone opens it.
  const castIds = useMemo(() => mine.map((c) => `${c.line}__${c.slug}`), [mine])
  const casts = useSubjectCasts(figure.slug, canMod, castIds)
  const characterCount = useMemo(() => mergeCasts(casts.data ?? []).length, [casts.data])

  // ── Downloads ──
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<ZipProgress | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function run(label: string, job: () => Promise<void>) {
    if (busy) return
    setBusy(label)
    setProgress(null)
    setNotice(null)
    job()
      .catch(() => setNotice('That download could not be made. Please try again.'))
      .finally(() => { setBusy(null); setProgress(null) })
  }
  const fileDownload = (s: ResearchSource, i: number) => () =>
    run(`${s.slug}#${i}`, () => downloadResearchFile(s, i))
  const filePdf = (s: ResearchSource, i: number) =>
    filePdfKey(s, i) ? () => run(`${s.slug}#${i}.pdf`, () => downloadFilePdf(s, i)) : undefined
  const wholePdf = (s: ResearchSource) =>
    sourcePdf(s) ? () => run(`${s.slug}.pdf`, () => downloadSourcePdf(s)) : undefined
  const sourceActions = (s: ResearchSource) => (
    <>
      <button
        type="button"
        className={CHIP}
        disabled={!!busy}
        onClick={() => run(`${s.slug}.md`, () => downloadSourceMarkdown(figure, s))}
        title={`The whole ${s.kind === 'book' ? 'book' : 'source'} as one Markdown file`}
        aria-label={`Download ${s.title} as one Markdown file`}
      >
        .md
      </button>
      <button
        type="button"
        className={CHIP}
        disabled={!!busy}
        onClick={() => run(`${s.slug}.zip`, () => downloadSourceZip(figure, s, setProgress))}
        title="One Markdown file per chapter, zipped"
        aria-label={`Download ${s.title} as a zip of its files`}
      >
        .zip
      </button>
      {sourcePdf(s) && (
        <button
          type="button"
          className={CHIP}
          disabled={!!busy}
          onClick={() => run(`${s.slug}.pdf`, () => downloadSourcePdf(s))}
          title={s.bundle?.pdf?.format === 'zip'
            ? 'Too long for one PDF: each file typeset as its own PDF, zipped'
            : `The whole ${s.kind === 'book' ? 'book' : 'source'}, typeset as one PDF`}
          aria-label={`Download ${s.title} as PDF`}
        >
          .pdf
        </button>
      )}
    </>
  )
  const totalFiles = sources.reduce((n, s) => n + s.files.length, 0)
  const zipCurrent = figureZipIsCurrent(figure, sources)
  const allPdf = figurePdf(figure, sources)

  return (
    <div>
      {/* ── Masthead ───────────────────────────────────────────────── */}
      <section className="surface-deep grain relative overflow-hidden">
        <div className="relative mx-auto max-w-[1100px] px-6 py-14 md:py-16">
          <h1 className="font-serif font-light leading-[1.0] text-brand-cream text-[2.1rem] md:text-[3rem]">
            {figureName(figure)}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-10 gap-y-3">
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/70">
              {figure.series}
            </span>
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
              {figure.sources_count} sources · {figure.words.toLocaleString()} words
            </span>
          </div>
          {/* Cross-listing: the same being held by more than one program. The
              figure's design lives in the primary program; each other program
              carries its own text-faithful dossier of them. */}
          {(figure.also_programs?.length ?? 0) > 0 && figure.line && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/70">
                Also appears in
              </span>
              {figure.also_programs!.map((p) => (
                <a
                  key={p}
                  href={`/programs/${figure.line}/${p}`}
                  className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold underline underline-offset-4 hover:text-brand-cream"
                >
                  {p.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Person tabs (Research ⇄ Comics ⇄ Characters) ─────────────── */}
      <PersonTabs
        figureSlug={figure.slug}
        comics={comics}
        active={tab}
        characterCount={characterCount || undefined}
        onCharacters={() => setTab('characters')}
        onResearch={() => setTab('research')}
      />

      {tab === 'characters' ? (
        <main className="mx-auto max-w-[1100px] px-6 pb-24 pt-12">
          <WorkCharacters
            casts={casts.data}
            loading={casts.loading}
            title={figureName(figure)}
            showComics={(casts.data?.length ?? 0) > 1}
          />
        </main>
      ) : (
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
            {sources.length > 0 && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => run('all', () => downloadFigureResearch(figure, sources, setProgress))}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-brand-indigo bg-brand-indigo px-3 py-2 font-sans text-[0.68rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-colors hover:bg-brand-twilight-mid disabled:opacity-50"
                >
                  <DownloadGlyph />
                  {busy === 'all' ? 'Preparing…' : 'Download all research'}
                </button>
                <p className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
                  {sources.length} sources · {totalFiles} files · one zip, a folder per source
                  {zipCurrent && figure.researchZip?.bytes ? ` · ${formatBytes(figure.researchZip.bytes)}` : ''}
                </p>
                {allPdf && (
                  <>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => run('all.pdf', () => downloadFigurePdf(figure, sources))}
                      className="mt-1 inline-flex items-center justify-center gap-2 rounded-md border border-brand-indigo px-3 py-2 font-sans text-[0.68rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-pale-dusk/60 disabled:opacity-50"
                    >
                      <DownloadGlyph />
                      {busy === 'all.pdf' ? 'Preparing…' : allPdf.format === 'zip' ? 'Download all as PDFs' : 'Download all as one PDF'}
                    </button>
                    <p className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
                      {allPdf.format === 'zip'
                        ? 'a typeset PDF per source, zipped'
                        : `typeset to read${allPdf.pages ? ` · ${allPdf.pages.toLocaleString()} pages` : ''}`}
                      {` · ${formatBytes(allPdf.bytes)}`}
                    </p>
                  </>
                )}
                {(busy || notice) && (
                  <p role="status" aria-live="polite" className="font-serif text-sm text-brand-umber">
                    {busy
                      ? progress && progress.total
                        ? `Fetching ${Math.min(progress.done + 1, progress.total)} of ${progress.total} files…`
                        : 'Preparing the download…'
                      : notice}
                  </p>
                )}
              </div>
            )}
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
                          onDownload={s.files.length > 1
                            ? () => run(`${s.slug}.md`, () => downloadSourceMarkdown(figure, s))
                            : fileDownload(s, 0)}
                          onPdf={s.files.length > 1 ? wholePdf(s) : filePdf(s, 0)}
                        />
                      )
                    })}
                  </CollapsibleGroup>
                )}

                {/* Books — each its own collapsible group of chapters, downloadable
                    as one Markdown file or as a zip of its chapters. */}
                {books.map((book) => (
                  <CollapsibleGroup
                    key={book.slug}
                    title={book.title}
                    meta={`book · ${book.words.toLocaleString()} words${sourcePdf(book)?.pages ? ` · ${sourcePdf(book)!.pages!.toLocaleString()} pages` : ''}${sourceBundleIsCurrent(book) && book.bundle?.zip?.bytes ? ` · ${formatBytes(book.bundle.zip.bytes)} zip` : ''}`}
                    open={!collapsed[book.slug]}
                    onToggle={() => toggle(book.slug)}
                    hasActive={book.files.some((f) => f.path === selected)}
                    actions={sourceActions(book)}
                  >
                    {book.files.map((file, i) => (
                      <FileItem
                        key={file.path}
                        label={file.title}
                        active={selected === file.path}
                        onSelect={() => setSelected(file.path)}
                        onDownload={fileDownload(book, i)}
                        onPdf={filePdf(book, i)}
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
                          onDownload={t.files.length > 1
                            ? () => run(`${t.slug}.md`, () => downloadSourceMarkdown(figure, t))
                            : fileDownload(t, 0)}
                          onPdf={t.files.length > 1 ? wholePdf(t) : filePdf(t, 0)}
                        />
                      )
                    })}
                  </CollapsibleGroup>
                )}

                {/* Anything else the dossier holds (topic notes, references) —
                    listed rather than silently dropped, each downloadable. */}
                {sources
                  .filter((s) => !SUBPART_KINDS.has(s.kind) && s.kind !== 'book' && s.kind !== 'transcript')
                  .map((s) => (
                    <CollapsibleGroup
                      key={s.slug}
                      title={s.title}
                      meta={`${s.kind.replace(/-/g, ' ')} · ${s.files.length} ${s.files.length === 1 ? 'file' : 'files'}`}
                      open={!!collapsed[s.slug]}
                      onToggle={() => toggle(s.slug)}
                      hasActive={s.files.some((f) => f.path === selected)}
                      actions={s.files.length > 1 ? sourceActions(s) : undefined}
                    >
                      {s.files.map((file, i) => (
                        <FileItem
                          key={file.path}
                          label={file.title}
                          active={selected === file.path}
                          onSelect={() => setSelected(file.path)}
                          onDownload={fileDownload(s, i)}
                          onPdf={filePdf(s, i)}
                        />
                      ))}
                    </CollapsibleGroup>
                  ))}
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
      )}
    </div>
  )
}

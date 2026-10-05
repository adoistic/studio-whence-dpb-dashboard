'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { Comic } from '@/types/content'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { useComicFeedback, type Author } from '@/lib/feedback'
import { visibleTo, type Thread } from '@/lib/feedbackTypes'
import { useGatedText } from '@/lib/useGatedText'
import {
  blockText, formatWords, manuscriptKeyFor, parseBookModel, passageAnchor, readingTime, SHELF_LABEL,
  locatePassage, type BookChapter, type BookModel,
} from '@/lib/books'
import { BookMargin, type OpenCite, type Pending } from '@/components/books/BookMargin'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', 'in-review': 'In review', approved: 'Approved', published: 'Published',
}

type Toolbar = { blockId: string; quote: string; text: string; top: number; left: number }

/**
 * A prose book, read like a document: chapter outline on the left, the whole
 * manuscript in the middle, comments and suggestions in the right margin.
 *
 * The repo manuscript is the master. Nothing here edits the text; a suggestion
 * records the exact replacement wording, and it is applied in the content repo,
 * where the citation gates re-run (spec §1, "comment and suggest").
 */
export function BookPageShell({ comic }: { comic: Comic }) {
  const { text, loading, error } = useGatedText(manuscriptKeyFor(comic))
  const model = useMemo(() => parseBookModel(text), [text])

  const { user, loading: authLoading } = useUser()
  const allowStatus = useAllowStatus(user, authLoading)
  const canMod = canModerate(allowStatus)
  const email = user?.email ?? ''
  const author = {
    email,
    name: user?.displayName ?? email,
    role: allowStatus === 'admin' ? 'admin' : canMod ? 'sub_admin' : 'allow',
  }
  const { data: threads } = useComicFeedback(`${comic.line}__${comic.slug}`, canMod, email)

  if (loading) {
    return <main className="mx-auto max-w-[900px] px-6 py-24 font-serif italic text-brand-slate">Opening the book…</main>
  }
  if (error || !model) {
    return (
      <main className="mx-auto max-w-[900px] px-6 py-24">
        <h1 className="font-serif text-3xl text-brand-indigo">{comic.title}</h1>
        <p className="mt-4 font-serif italic text-brand-slate">The manuscript for this book is not available yet.</p>
      </main>
    )
  }
  return <BookDocument comic={comic} model={model} threads={threads} canMod={canMod} author={author} />
}

/** The book as a document: outline, manuscript, margin. Pure of data loading, so
 *  it renders from any model (the dev preview harness feeds it fixtures). */
export function BookDocument({
  comic, model, threads, canMod, author,
}: {
  comic: Comic
  model: BookModel
  threads: Thread[]
  canMod: boolean
  author: Author
}) {
  const comicId = `${comic.line}__${comic.slug}`
  const canvasRef = useRef<HTMLElement>(null)
  const [toolbar, setToolbar] = useState<Toolbar | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [openCite, setOpenCite] = useState<OpenCite | null>(null)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [activeChapter, setActiveChapter] = useState(1)
  const [flash, setFlash] = useState<string | null>(null)

  // Which paragraphs carry comments, after re-anchoring each to where its words now are.
  const notesByBlock = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const t of threads.filter((x) => visibleTo(x.root, canMod))) {
      if (t.root.status && !['open', 'in_progress'].includes(t.root.status)) continue
      const a = t.root.anchors[0]
      if (!a || a.kind !== 'passage') continue
      const where = locatePassage(model, a)
      if (where.blockId) m.set(where.blockId, [...(m.get(where.blockId) ?? []), t.root.id])
    }
    return m
  }, [model, threads, canMod])

  // Outline scroll-spy.
  useEffect(() => {
    if (!canvasRef.current) return
    const sections = Array.from(canvasRef.current.querySelectorAll<HTMLElement>('section[data-chapter]'))
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActiveChapter(Number(top.target.getAttribute('data-chapter')))
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [model])

  function jumpTo(blockId: string) {
    const el = document.getElementById(blockId)
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    setFlash(blockId)
    window.setTimeout(() => setFlash((f) => (f === blockId ? null : f)), 1600)
  }

  function handleSelection() {
    const sel = window.getSelection()
    const canvas = canvasRef.current
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !canvas) { setToolbar(null); return }
    const range = sel.getRangeAt(0)
    const blockOf = (n: Node) => (n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as Element))?.closest<HTMLElement>('[data-block]')
    const start = blockOf(range.startContainer)
    const end = blockOf(range.endContainer)
    // One paragraph at a time: a comment pinned across paragraphs has no single place to live.
    if (!start || start !== end || !canvas.contains(start)) { setToolbar(null); return }
    const quote = sel.toString().replace(/\s+/g, ' ').trim()
    if (quote.length < 2) { setToolbar(null); return }
    const rect = range.getBoundingClientRect()
    const base = canvas.getBoundingClientRect()
    setToolbar({
      blockId: start.dataset.block!,
      quote,
      text: start.dataset.text ?? quote,
      top: rect.top - base.top - 46,
      left: Math.min(Math.max(rect.left - base.left + rect.width / 2, 90), base.width - 90),
    })
  }

  function startFromToolbar(mode: 'comment' | 'suggest') {
    if (!toolbar) return
    const anchor = passageAnchor(toolbar.blockId, toolbar.quote, toolbar.text)
    setPending({ mode, anchor })
    setOpenCite(null)
    setToolbar(null)
    window.getSelection()?.removeAllRanges()
  }

  const cites = model.chapters.reduce((n, c) => n + c.cites.length, 0)

  return (
    <div className="surface-books min-h-screen">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="mx-auto max-w-[1400px] px-6 pb-10 pt-14">
        <nav className="flex items-center gap-3 font-sans text-[0.7rem] uppercase tracking-label text-brand-umber">
          <Link href="/" className="hover:underline">Books</Link>
          <span aria-hidden>/</span>
          <a href={`/${comic.line}`} className="hover:underline">{comic.series ? String(comic.series).replace(/-/g, ' ') : 'Shelf'}</a>
        </nav>
        <h1 className="mt-6 max-w-4xl font-serif text-[2.4rem] font-light leading-[1.02] text-brand-deep md:text-[3.4rem]">
          {model.title}
        </h1>
        {model.subtitle && <p className="mt-3 max-w-3xl font-serif text-xl text-brand-umber">{model.subtitle}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 font-sans text-[0.72rem] text-brand-slate">
          {model.status && (
            <span className="rounded-full border border-brand-gold/60 px-2.5 py-0.5 uppercase tracking-label text-brand-umber">
              {STATUS_LABEL[model.status] ?? model.status}
            </span>
          )}
          {model.shelf && <span>{SHELF_LABEL[model.shelf] ?? model.shelf}</span>}
          <span>{model.chapters.length} chapters</span>
          <span>{formatWords(model.words)}</span>
          <span>{readingTime(model.words)}</span>
          <span>{cites} source notes</span>
          {comic.version ? <span>Version {comic.version}</span> : null}
          {model.updated && <span>Updated {model.updated}</span>}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-10 px-6 pb-32 lg:grid-cols-[210px_minmax(0,1fr)_340px]">
        {/* ── Outline ──────────────────────────────────────────── */}
        <aside className="hidden lg:block">
          <nav aria-label="Chapters" className="sticky top-24 flex max-h-[calc(100vh-7rem)] flex-col gap-0.5 overflow-auto pr-2">
            <span className="mb-2 font-sans text-[0.62rem] uppercase tracking-label text-brand-gold">Contents</span>
            {model.chapters.map((c) => (
              <a
                key={c.id}
                href={`#${c.id}`}
                className={`rounded-md px-2 py-1.5 font-serif text-[0.86rem] leading-snug transition-colors ${
                  activeChapter === c.n ? 'bg-brand-indigo/10 text-brand-indigo' : 'text-brand-umber hover:bg-brand-indigo/5'
                }`}
              >
                <span className="mr-1.5 font-sans text-[0.65rem] text-brand-slate">
                  {c.label && !c.label.startsWith('Chapter') ? '' : (c.label?.replace('Chapter ', '') ?? c.n)}
                </span>
                {c.title}
              </a>
            ))}
          </nav>
        </aside>

        {/* ── The document ─────────────────────────────────────── */}
        <article
          ref={canvasRef}
          className="book-page relative mx-auto w-full max-w-[44rem] rounded-sm bg-white px-6 py-12 md:px-14 md:py-16"
          onMouseUp={handleSelection}
          onKeyUp={handleSelection}
        >
          {model.logline && <p className="book-logline">{model.logline}</p>}
          {model.chapters.map((ch) => (
            <Chapter
              key={ch.id}
              chapter={ch}
              notesByBlock={notesByBlock}
              flash={flash}
              onCite={(n) => {
                const cite = ch.cites.find((c) => c.n === n)
                if (cite) { setOpenCite({ chapter: ch.n, cite }); setPending(null) }
              }}
              onNotes={(blockId) => {
                const id = notesByBlock.get(blockId)?.[0]
                if (id) {
                  setActiveThreadId(id)
                  setOpenCite(null)
                  document.getElementById(`thread-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                }
              }}
            />
          ))}
          {toolbar && (
            <div
              role="toolbar"
              aria-label="Selected text"
              className="absolute z-20 flex -translate-x-1/2 gap-1 rounded-lg border border-brand-indigo/20 bg-brand-deep p-1 shadow-lg"
              style={{ top: toolbar.top, left: toolbar.left }}
              onMouseUp={(e) => e.stopPropagation()}
            >
              <button type="button" onClick={() => startFromToolbar('comment')} className="rounded-md px-3 py-1.5 font-sans text-[0.72rem] text-brand-cream hover:bg-white/10">
                Comment
              </button>
              <button type="button" onClick={() => startFromToolbar('suggest')} className="rounded-md px-3 py-1.5 font-sans text-[0.72rem] text-brand-cream hover:bg-white/10">
                Suggest edit
              </button>
            </div>
          )}
        </article>

        {/* ── Margin ───────────────────────────────────────────── */}
        <aside>
          <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-auto lg:pr-1">
            <BookMargin
              model={model}
              comicId={comicId}
              line={comic.line}
              comicVersion={comic.version ?? 0}
              threads={threads}
              canMod={canMod}
              author={author}
              pending={pending}
              onClearPending={() => setPending(null)}
              openCite={openCite}
              onCloseCite={() => setOpenCite(null)}
              activeThreadId={activeThreadId}
              onSelectThread={(id, blockId) => { setActiveThreadId(id); if (blockId) jumpTo(blockId) }}
              onNewGeneral={() => { setPending({ mode: 'comment', anchor: null }); setOpenCite(null) }}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

function Chapter({
  chapter, notesByBlock, flash, onCite, onNotes,
}: {
  chapter: BookChapter
  notesByBlock: Map<string, string[]>
  flash: string | null
  onCite: (n: number) => void
  onNotes: (blockId: string) => void
}) {
  const firstParaId = chapter.blocks.find((b) => b.kind === 'para')?.id
  return (
    <section id={chapter.id} data-chapter={chapter.n} className="book-chapter">
      <p className="book-chapter-number">{chapter.label ?? `Chapter ${chapter.n}`}</p>
      <h2 className="book-chapter-title">{chapter.title}</h2>
      {chapter.blocks.map((b, i) => {
        if (b.kind === 'break') return <p key={`br-${i}`} className="book-break" aria-hidden>* * *</p>
        const notes = b.id ? notesByBlock.get(b.id)?.length ?? 0 : 0
        const Tag = b.kind === 'epigraph' ? 'blockquote' : 'p'
        const cls = [
          b.kind === 'epigraph' ? 'book-epigraph' : 'book-para',
          b.id && b.id === firstParaId ? 'book-para-first' : '',
          notes ? 'book-has-notes' : '',
          flash === b.id ? 'book-flash' : '',
        ].join(' ')
        return (
          <Tag key={b.id ?? i} id={b.id} data-block={b.id} data-text={blockText(b)} className={cls}>
            {(b.parts ?? []).map((p, j) =>
              'cite' in p ? (
                <button
                  key={j}
                  type="button"
                  className="book-cite"
                  onClick={() => onCite(p.cite)}
                  aria-label={`Source ${p.cite}`}
                >
                  {p.cite}
                </button>
              ) : (
                <span key={j}>{p.t}</span>
              ),
            )}
            {notes > 0 && b.id && (
              <button type="button" className="book-note-pin" onClick={() => onNotes(b.id!)} aria-label={`${notes} comment${notes > 1 ? 's' : ''} on this paragraph`}>
                {notes}
              </button>
            )}
          </Tag>
        )
      })}
    </section>
  )
}

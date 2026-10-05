'use client'

import { useMemo, useState } from 'react'
import { addComment, addReply, setStatus, setPublished, editComment, hideComment, deleteComment, type Author } from '@/lib/feedback'
import {
  CATEGORY_LABELS, CATEGORY_ORDER, nodeLang, visibleTo,
  type Anchor, type Category, type Thread,
} from '@/lib/feedbackTypes'
import { CommentThread } from '@/components/feedback/CommentThread'
import { ResearchReader } from '@/components/ResearchReader'
import { useGatedText } from '@/lib/useGatedText'
import { excerptPassage } from '@/lib/provenance'
import { locatePassage, passageOrder, type BookCite, type BookModel } from '@/lib/books'

export type Pending = { mode: 'comment' | 'suggest'; anchor: Anchor | null }
export type OpenCite = { chapter: number; cite: BookCite }

const CATEGORIES = CATEGORY_ORDER.filter((c) => c !== 'art' && c !== 'pacing')

function Composer({
  pending, canMod, onSubmit, onCancel,
}: {
  pending: Pending
  canMod: boolean
  onSubmit: (v: { body: string; category: Category; published: boolean; to?: string }) => Promise<void>
  onCancel: () => void
}) {
  const suggesting = pending.mode === 'suggest'
  const [to, setTo] = useState(pending.anchor?.quote ?? '')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<Category>(suggesting ? 'clarity' : 'fact')
  const [publish, setPublish] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (suggesting && (!to.trim() || to.trim() === pending.anchor?.quote)) {
      setError('Write the replacement wording first.')
      return
    }
    if (!suggesting && !body.trim()) {
      setError('Write a comment first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ body: body.trim(), category, published: canMod ? publish : false, to: suggesting ? to.trim() : undefined })
    } catch {
      setError('That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand-indigo/30 bg-white p-4">
      <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-gold">
        {suggesting ? 'Suggest an edit' : pending.anchor ? 'Comment on this passage' : 'General comment'}
      </span>
      {pending.anchor?.quote && (
        <blockquote className={`border-l-2 border-brand-pale-dusk pl-3 font-serif text-sm leading-relaxed text-brand-umber ${suggesting ? 'line-through decoration-red-700/60' : ''}`}>
          {pending.anchor.quote}
        </blockquote>
      )}
      {suggesting && (
        <label className="flex flex-col gap-1">
          <span className="font-sans text-[0.68rem] text-brand-slate">Replace with, exactly as it should read</span>
          <textarea
            value={to}
            onChange={(e) => { setTo(e.target.value); setError(null) }}
            rows={3}
            className="rounded-md border border-brand-pale-dusk p-2 font-serif text-sm text-brand-deep focus:border-brand-indigo focus:outline-none"
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="font-sans text-[0.68rem] text-brand-slate">{suggesting ? 'Why (optional)' : 'Comment'}</span>
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); setError(null) }}
          rows={suggesting ? 2 : 4}
          className="rounded-md border border-brand-pale-dusk p-2 font-serif text-sm text-brand-deep focus:border-brand-indigo focus:outline-none"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          aria-label="Category"
          className="rounded-md border border-brand-pale-dusk bg-white px-2 py-1 font-sans text-[0.72rem] text-brand-umber"
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        {canMod && (
          <label className="flex items-center gap-1.5 font-sans text-[0.72rem] text-brand-slate">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Publish now
          </label>
        )}
      </div>
      {error && <p role="alert" className="font-sans text-[0.75rem] text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-md bg-brand-indigo px-3 py-1.5 font-sans text-[0.72rem] uppercase tracking-label text-white hover:bg-brand-deep"
        >
          {busy ? 'Saving…' : suggesting ? 'Suggest' : 'Comment'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 font-sans text-[0.72rem] uppercase tracking-label text-brand-slate hover:text-brand-indigo">
          Cancel
        </button>
      </div>
    </div>
  )
}

function SourcePanel({ open, onClose }: { open: OpenCite; onClose: () => void }) {
  const { cite } = open
  const { text, loading, error } = useGatedText(cite.key)
  const [full, setFull] = useState(false)
  const excerpt = text ? excerptPassage(text, cite.line, 600) : ''
  const name = cite.path.split('/').slice(-3).join(' / ').replace(/\.md$/, '')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-gold">
          Source {cite.n} · chapter {open.chapter}
        </span>
        <button type="button" onClick={onClose} className="font-sans text-[0.72rem] text-brand-slate hover:text-brand-indigo">
          Back to comments
        </button>
      </div>
      {cite.title && <p className="font-serif text-[0.95rem] leading-snug text-brand-deep">{cite.title}</p>}
      <p className="break-words font-sans text-[0.72rem] text-brand-slate">{name}, line {cite.line}</p>
      {loading && <p className="font-serif italic text-brand-slate">Opening the source…</p>}
      {error && <p className="font-serif italic text-brand-slate">This source is not available to you.</p>}
      {excerpt && (
        <blockquote className="border-l-2 border-brand-gold pl-3 font-serif text-[0.95rem] leading-relaxed text-brand-deep">
          {excerpt}
        </blockquote>
      )}
      {text && (
        <button type="button" onClick={() => setFull((v) => !v)} className="self-start font-sans text-[0.72rem] uppercase tracking-label text-brand-indigo hover:underline">
          {full ? 'Hide the full source' : 'Read it in context'}
        </button>
      )}
      {full && (
        <div className="max-h-[60vh] overflow-auto rounded-md border border-brand-pale-dusk bg-white p-3 text-sm">
          <ResearchReader fileKey={cite.key} targetLine={cite.line} />
        </div>
      )}
    </div>
  )
}

export function BookMargin({
  model, comicId, line, comicVersion, threads, canMod, author, pending, onClearPending,
  openCite, onCloseCite, activeThreadId, onSelectThread, onNewGeneral,
}: {
  model: BookModel
  comicId: string
  line: string
  comicVersion: number
  threads: Thread[]
  canMod: boolean
  author: Author
  pending: Pending | null
  onClearPending: () => void
  openCite: OpenCite | null
  onCloseCite: () => void
  activeThreadId: string | null
  onSelectThread: (threadId: string, blockId: string | null) => void
  onNewGeneral: () => void
}) {
  const [showClosed, setShowClosed] = useState(false)
  const lang = model.language ?? 'en'

  const knownRefs = useMemo(() => {
    const s = new Set<string>()
    for (const ch of model.chapters) for (const b of ch.blocks) if (b.id) s.add(b.id)
    return s
  }, [model])

  const visible = threads.filter((t) => visibleTo(t.root, canMod))
  const shown = visible
    .filter((t) => showClosed || ['open', 'in_progress', undefined].includes(t.root.status))
    .map((t) => {
      const a = t.root.anchors[0]
      const where = a && a.kind === 'passage' ? locatePassage(model, a) : null
      return { t, a, where }
    })
    .sort((x, y) => passageOrder(x.where?.blockId ?? x.a?.ref) - passageOrder(y.where?.blockId ?? y.a?.ref))
  const closedCount = visible.length - visible.filter((t) => ['open', 'in_progress', undefined].includes(t.root.status)).length

  if (openCite) return <SourcePanel open={openCite} onClose={onCloseCite} />

  async function create(v: { body: string; category: Category; published: boolean; to?: string }) {
    if (!pending) return
    const anchors = pending.anchor ? [pending.anchor] : []
    const suggestion = v.to && pending.anchor?.quote ? { from: pending.anchor.quote, to: v.to } : undefined
    await addComment(
      { comicId, line, anchors, comicVersion, category: v.category, published: v.published,
        body: v.body || (suggestion ? 'Suggested edit' : ''), lang, langScope: lang, suggestion },
      author,
    )
    onClearPending()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-gold">
          Comments · {visible.length}
        </span>
        <button type="button" onClick={onNewGeneral} className="font-sans text-[0.72rem] text-brand-indigo hover:underline">
          General comment
        </button>
      </div>
      <p className="-mt-2 font-sans text-[0.72rem] leading-relaxed text-brand-slate">
        Select words in the text to comment on them or suggest new wording.
      </p>

      {pending && <Composer key={`${pending.mode}-${pending.anchor?.ref ?? 'general'}`} pending={pending} canMod={canMod} onSubmit={create} onCancel={onClearPending} />}

      {shown.map(({ t, a, where }) => {
        const active = t.root.id === activeThreadId
        return (
          <div
            key={t.root.id}
            id={`thread-card-${t.root.id}`}
            className={`flex flex-col gap-2 rounded-lg border bg-white/80 p-3 transition-shadow ${active ? 'border-brand-indigo shadow-[0_0_0_2px_rgba(59,54,100,0.25)]' : 'border-brand-pale-dusk'}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button, a, select, textarea, input')) return
              onSelectThread(t.root.id, where?.blockId ?? null)
            }}
          >
            {a?.quote && (
              <button type="button" onClick={() => onSelectThread(t.root.id, where?.blockId ?? null)} className="text-left">
                <span className="line-clamp-2 border-l-2 border-brand-gold/60 pl-2 font-serif text-[0.85rem] italic text-brand-umber">
                  {a.quote}
                </span>
              </button>
            )}
            {where?.state === 'moved' && (
              <span className="font-sans text-[0.65rem] text-brand-slate">The passage has moved; this follows it.</span>
            )}
            {where?.state === 'outdated' && (
              <span className="font-sans text-[0.65rem] text-amber-700">The text has changed since this comment.</span>
            )}
            {t.root.suggestion && (
              <div className="rounded-md bg-brand-threshold p-2 font-serif text-[0.85rem] leading-relaxed">
                <span className="mr-1 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">Suggested</span>
                <del className="text-red-800/80">{t.root.suggestion.from}</del>{' '}
                <ins className="text-emerald-800 no-underline">{t.root.suggestion.to}</ins>
              </div>
            )}
            <CommentThread
              thread={t}
              canModerate={canMod}
              currentEmail={author.email}
              changedSince={false}
              knownRefs={knownRefs}
              lang={lang}
              originalLanguage={lang}
              onReply={async (body, published) => {
                await addReply(
                  { comicId, line, parentId: t.root.id, body, comicVersion,
                    published: published ?? t.root.published === true,
                    lang: nodeLang(t.root, lang), langScope: t.root.langScope ?? nodeLang(t.root, lang) },
                  author,
                )
              }}
              onSetStatus={(s) => setStatus(t.root.id, s)}
              onHide={(h) => hideComment(t.root.id, h)}
              onDelete={(id) => deleteComment(id)}
              onJumpToBeat={() => onSelectThread(t.root.id, where?.blockId ?? null)}
              onApprove={() => setPublished(t.root.id, true, { email: author.email, name: author.name })}
              onEdit={async (body) => { await editComment(t.root.id, { body }) }}
            />
          </div>
        )
      })}

      {shown.length === 0 && !pending && (
        <p className="font-sans text-[0.75rem] text-brand-slate/70">No open comments.</p>
      )}
      {closedCount > 0 && (
        <button type="button" onClick={() => setShowClosed((v) => !v)} className="self-start font-sans text-[0.72rem] text-brand-slate hover:text-brand-indigo">
          {showClosed ? 'Hide resolved and parked' : `Show ${closedCount} resolved or parked`}
        </button>
      )}
    </div>
  )
}

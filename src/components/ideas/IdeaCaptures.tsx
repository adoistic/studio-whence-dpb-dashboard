'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { useIdeaCaptures } from '@/lib/ideaCaptures'
import { readIdeaCapture } from '@/lib/dataApi'
import type { IdeaCapture } from '@/types/idea'

/**
 * Captured ChatGPT conversations for an idea, rendered below the body.
 *
 * SECURITY: transcripts are UNTRUSTED fetched content — they are rendered with
 * react-markdown's default urlTransform and the DEFAULT rehype-sanitize schema
 * (two separate defaults; no r2:/data: pass-through). Never render them with
 * IdeaMarkdown, whose schema is deliberately widened for idea bodies.
 */

const STATUS_STYLE: Record<IdeaCapture['status'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  captured: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
}

function formatCapturedDate(capture: IdeaCapture): string | null {
  if (!capture.capturedAt) return null
  return new Date(capture.capturedAt.toMillis()).toLocaleDateString()
}

// NOTE: the row header is a <div>, not a <button> — an <a> may not nest inside
// a button, and a disabled button would suppress clicks on the "original ↗"
// link exactly on failed rows (spec §4.6: the link must stay clickable).
function CaptureRow({ ideaId, capture }: { ideaId: string; capture: IdeaCapture }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const toggle = async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (text !== null || loading) return
    setLoading(true)
    setLoadError(null)
    try {
      setText(await readIdeaCapture(ideaId, capture.id))
    } catch {
      setLoadError('Could not load the transcript.')
    } finally {
      setLoading(false)
    }
  }

  const capturedDate = formatCapturedDate(capture)
  return (
    <li className="rounded-lg border border-brand-pale-dusk bg-white/70">
      <div className="flex w-full flex-wrap items-center gap-2 px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 font-sans text-[0.6rem] uppercase tracking-label ${STATUS_STYLE[capture.status]}`}
        >
          {capture.status}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-brand-umber">
          {capture.status === 'pending'
            ? 'Capturing…'
            : capture.title || capture.shareId}
        </span>
        {capture.status === 'captured' && capture.messageCount !== null && (
          <span className="font-sans text-[0.65rem] text-brand-slate">
            {capture.messageCount} messages
          </span>
        )}
        {capture.status === 'captured' && capturedDate && (
          <span className="font-sans text-[0.65rem] text-brand-slate">{capturedDate}</span>
        )}
        {capture.status === 'failed' && capture.error && (
          <span className="font-sans text-[0.65rem] text-red-700">{capture.error}</span>
        )}
        <a
          href={capture.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-sans text-[0.65rem] text-brand-indigo underline"
        >
          original ↗
        </a>
        {capture.status === 'captured' && (
          <button
            type="button"
            onClick={() => void toggle()}
            className="rounded-md border border-brand-pale-dusk px-2 py-1 font-sans text-[0.6rem] uppercase tracking-label text-brand-umber transition-colors hover:bg-brand-indigo/5"
          >
            {open ? 'Hide' : 'Read'}
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-brand-pale-dusk px-4 py-3">
          {loading && (
            <p className="font-sans text-[0.7rem] text-brand-slate">Loading transcript…</p>
          )}
          {loadError && (
            <p className="font-sans text-[0.7rem] text-red-700">{loadError}</p>
          )}
          {text !== null && (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {text}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export function IdeaCaptures({ ideaId }: { ideaId: string }) {
  const { data } = useIdeaCaptures(ideaId)
  if (data.length === 0) return null
  return (
    <section className="mt-4">
      <h3 className="mb-2 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
        ChatGPT conversations
      </h3>
      <ul className="flex flex-col gap-2">
        {data.map((c) => (
          <CaptureRow key={c.id} ideaId={ideaId} capture={c} />
        ))}
      </ul>
    </section>
  )
}

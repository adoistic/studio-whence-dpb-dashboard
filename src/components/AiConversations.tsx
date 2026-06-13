'use client'

import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { useAiConversations, readAiConversation, stripCiteTokens } from '@/lib/aiConversations'
import { rehypeSourceLines } from '@/lib/rehypeSourceLines'
import { SectionHead } from '@/components/SectionHead'
import { ConversationAnalysis } from '@/components/ConversationAnalysis'
import type { AiConversation } from '@/types/aiConversation'

// The DEFAULT rehype-sanitize schema, widened only to keep the data-sl/data-el
// line-range attributes that rehypeSourceLines stamps (needed for scroll-to-
// line). Everything else stays at the strict default — no href/src/style
// pass-through, so untrusted transcript content is still locked down.
export const TRANSCRIPT_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'dataSl', 'dataEl'],
  },
}

/**
 * Migrated AI chat conversations attached to a line (or a specific comic),
 * rendered as an expandable list.
 *
 * SECURITY: transcripts are UNTRUSTED fetched content — they are rendered with
 * react-markdown's default urlTransform and the DEFAULT rehype-sanitize schema
 * (no r2:/data: pass-through), exactly as IdeaCaptures does. Never widen this.
 */

function formatConversationDate(c: AiConversation): string | null {
  const ts = c.conversationCreatedAt ?? c.createdAt
  if (!ts) return null
  return new Date(ts.toMillis()).toLocaleDateString()
}

function ConversationRow({ conversation }: { conversation: AiConversation }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)

  // Reuses the research-provenance scroll-to-line approach: rehypeSourceLines
  // stamps every rendered block with data-sl/data-el (its markdown line range),
  // so we find the block covering `line`, scroll it into view, and flash the
  // shared .rp-hit highlight for ~1.5s.
  const scrollTranscriptToLine = (line: number) => {
    const root = transcriptRef.current
    if (!root) return
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-sl]'))
    let hit: HTMLElement | null = null
    for (const el of blocks) {
      const sl = Number(el.getAttribute('data-sl'))
      const el2 = Number(el.getAttribute('data-el') ?? sl)
      if (sl <= line && line <= el2) {
        hit = el
        break
      }
      if (sl <= line) hit = el // fallback: last block starting at/before
    }
    if (!hit) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    hit.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    hit.classList.add('rp-hit')
    const target = hit
    window.setTimeout(() => target.classList.remove('rp-hit'), 1600)
  }

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
      setText(await readAiConversation(conversation.id))
    } catch {
      setLoadError('Could not load the transcript.')
    } finally {
      setLoading(false)
    }
  }

  const date = formatConversationDate(conversation)
  return (
    <li className="rounded-lg border border-brand-pale-dusk bg-white/70">
      <div className="flex w-full flex-wrap items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm text-brand-umber">
          {conversation.title || conversation.id}
        </span>
        {conversation.model && (
          <span className="font-sans text-[0.65rem] text-brand-slate">{conversation.model}</span>
        )}
        {conversation.messageCount !== null && (
          <span className="font-sans text-[0.65rem] text-brand-slate">
            {conversation.messageCount} messages
          </span>
        )}
        {date && <span className="font-sans text-[0.65rem] text-brand-slate">{date}</span>}
        <button
          type="button"
          onClick={() => void toggle()}
          className="rounded-md border border-brand-pale-dusk px-2 py-1 font-sans text-[0.6rem] uppercase tracking-label text-brand-umber transition-colors hover:bg-brand-indigo/5"
        >
          {open ? 'Hide' : 'Read'}
        </button>
      </div>
      {open && (
        <div className="border-t border-brand-pale-dusk px-4 py-3">
          {loading && (
            <p className="font-sans text-[0.7rem] text-brand-slate">Loading transcript…</p>
          )}
          {loadError && <p className="font-sans text-[0.7rem] text-red-700">{loadError}</p>}
          {text !== null && (
            <div className="flex flex-col gap-4 md:flex-row md:gap-6">
              {conversation.analysis && (
                <div className="md:w-72 md:flex-none md:border-r md:border-brand-pale-dusk md:pr-6">
                  <ConversationAnalysis
                    analysis={conversation.analysis}
                    onJump={scrollTranscriptToLine}
                  />
                </div>
              )}
              <div
                ref={transcriptRef}
                className="research-prose prose prose-sm min-w-0 max-w-none flex-1"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSourceLines, [rehypeSanitize, TRANSCRIPT_SCHEMA]]}
                >
                  {stripCiteTokens(text)}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export function AiConversations({
  line,
  comicSlug,
  figureSlug,
  heading,
}: {
  line: string
  comicSlug?: string
  figureSlug?: string
  /** Optional section heading; when given it replaces the default h3 and rides
   *  inside the self-hide so callers don't leave an orphan heading on empty. */
  heading?: { kicker: string; title: string }
}) {
  const { conversations, loading } = useAiConversations({ line, comicSlug, figureSlug })
  const Heading = () =>
    heading ? (
      <SectionHead kicker={heading.kicker} title={heading.title} />
    ) : (
      <h3 className="mb-2 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
        AI Conversations
      </h3>
    )
  if (loading) {
    return (
      <section className="mt-4 flex flex-col gap-3">
        <Heading />
        <p className="font-sans text-[0.7rem] text-brand-slate">Loading…</p>
      </section>
    )
  }
  if (conversations.length === 0) return null
  return (
    <section className="mt-4 flex flex-col gap-3">
      <Heading />
      <ul className="flex flex-col gap-2">
        {conversations.map((c) => (
          <ConversationRow key={c.id} conversation={c} />
        ))}
      </ul>
    </section>
  )
}

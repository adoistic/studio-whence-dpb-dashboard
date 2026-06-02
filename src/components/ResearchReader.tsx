'use client'

import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useGatedText } from '@/lib/useGatedText'
import { rehypeSourceLines } from '@/lib/rehypeSourceLines'

export function ResearchReader({
  fileKey,
  targetLine,
}: {
  fileKey: string | null
  targetLine?: number
}) {
  const { text, loading, error } = useGatedText(fileKey)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!text || targetLine == null || !ref.current) return
    const blocks = Array.from(ref.current.querySelectorAll<HTMLElement>('[data-sl]'))
    let hit: HTMLElement | null = null
    for (const el of blocks) {
      const sl = Number(el.getAttribute('data-sl'))
      const el2 = Number(el.getAttribute('data-el') ?? sl)
      if (sl <= targetLine && targetLine <= el2) { hit = el; break }
      if (sl <= targetLine) hit = el // fallback: last block starting at/before
    }
    if (!hit) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    hit.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    hit.classList.add('rp-hit')
    const t = window.setTimeout(() => hit?.classList.remove('rp-hit'), 1600)
    return () => window.clearTimeout(t)
  }, [text, targetLine, fileKey])

  if (!fileKey) {
    return <p className="font-serif italic text-brand-slate">Select a chapter to read.</p>
  }
  if (loading) {
    return (
      <p role="status" className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
        Loading…
      </p>
    )
  }
  if (error) {
    return (
      <p role="status" className="font-serif italic text-brand-slate">Couldn’t load this file.</p>
    )
  }
  if (!text) {
    return <p className="font-serif italic text-brand-slate">This file is empty.</p>
  }
  return (
    <div ref={ref} className="research-prose max-w-2xl font-serif text-brand-umber leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSourceLines]}
        components={{
          h1: 'h2', h2: 'h3', h3: 'h4', h4: 'h5', h5: 'h6', h6: 'h6',
          strong: ({ children }) => <strong className="rp-speaker">{children}</strong>,
          em: ({ children }) => <em className="rp-time">{children}</em>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

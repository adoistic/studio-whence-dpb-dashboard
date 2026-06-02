'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useGatedText } from '@/lib/useGatedText'

export function ResearchReader({ fileKey }: { fileKey: string | null }) {
  const { text, loading, error } = useGatedText(fileKey)

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
    <div className="research-prose max-w-2xl font-serif text-brand-umber leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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

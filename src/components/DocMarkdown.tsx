'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Thin markdown renderer for client-facing comic docs (concept-note, etc.). */
export function DocMarkdown({ text }: { text: string }) {
  return (
    <div className="doc-prose max-w-2xl font-serif text-brand-umber leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}

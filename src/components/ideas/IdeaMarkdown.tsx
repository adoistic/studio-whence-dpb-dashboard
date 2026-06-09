'use client'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { useResolved } from '@/lib/useResolved'

const R2 = 'r2:'

// react-markdown's defaultUrlTransform strips r2:/data: URLs to '' before the
// custom img component (or the sanitizer) ever sees them. Let those two through
// untouched; everything else keeps the default safety transform.
function ideaUrlTransform(url: string): string {
  if (url.startsWith('r2:') || url.startsWith('data:')) return url
  return defaultUrlTransform(url)
}

// Sanitize schema: allow GFM table tags plus the r2:/data: protocols on `src`.
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'data', 'r2'],
  },
}

function IdeaImg(props: { src?: string | Blob; alt?: string }) {
  const src = typeof props.src === 'string' ? props.src : ''
  const isR2 = src.startsWith(R2)
  const key = isR2 ? src.slice(R2.length) : ''
  const resolved = useResolved(isR2 ? [key] : [])
  if (isR2) {
    const url = resolved[key]
    if (!url) return <span aria-busy="true" className="text-brand-ink/40">loading image…</span>
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={props.alt ?? ''} className="max-w-full rounded" />
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={props.alt ?? ''} className="max-w-full rounded" />
}

export function IdeaMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        urlTransform={ideaUrlTransform}
        components={{ img: IdeaImg }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

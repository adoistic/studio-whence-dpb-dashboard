'use client'

import { useState } from 'react'
import type { Idea, IdeaStatus } from '@/types/idea'
import { type AllowStatus } from '@/lib/auth'
import { setIdeaStatus, setIdeaTags, deleteIdea } from '@/lib/ideas'
import { buildClipboardPayload, type ImageResolver } from '@/lib/ideaCopy'
import { resolveUrls } from '@/lib/dataApi'
import { formatRelative } from '@/lib/dates'
import { IdeaMarkdown } from '@/components/ideas/IdeaMarkdown'

const STATUS_OPTIONS: IdeaStatus[] = ['new', 'triaged', 'actioned', 'archived']
const STATUS_LABEL: Record<IdeaStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  actioned: 'Actioned',
  archived: 'Archived',
}

/**
 * Resolver for the copy-out: presigned URL → fetched bytes → base64 data URI,
 * so the clipboard payload carries images inline (paste lands in Docs/email
 * without our gated URLs).
 */
async function resolveImageForCopy(key: string): Promise<{ dataUri: string; bytes: number }> {
  const urls = await resolveUrls([key])
  const url = urls[key]
  if (!url) return { dataUri: '', bytes: 0 }
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  const bytes = buf.byteLength
  const contentType = res.headers.get('content-type') || 'image/png'
  let binary = ''
  const arr = new Uint8Array(buf)
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i])
  const dataUri = `data:${contentType};base64,${btoa(binary)}`
  return { dataUri, bytes }
}

export function IdeaView({
  idea,
  role,
  viewerEmail,
}: {
  idea: Idea
  role: AllowStatus
  viewerEmail: string
}) {
  const isAdmin = role === 'admin'
  const canDelete = isAdmin || idea.author === viewerEmail
  const [tagsRaw, setTagsRaw] = useState(idea.tags.join(', '))
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    const resolver: ImageResolver = resolveImageForCopy
    const payload = await buildClipboardPayload(idea.bodyMarkdown, resolver)
    const htmlBlob = new Blob([payload.html], { type: 'text/html' })
    const textBlob = new Blob([payload.text], { type: 'text/plain' })
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
    ])
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const commitTags = () => {
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
    void setIdeaTags(idea.id, tags)
  }

  const when = idea.createdAt
    ? formatRelative(new Date(idea.createdAt.toMillis()).toISOString())
    : 'just now'

  return (
    <article className="rounded-xl border border-brand-pale-dusk bg-white/60 p-5">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {idea.title && (
            <h2 className="truncate text-lg font-semibold text-brand-umber">{idea.title}</h2>
          )}
          <p className="font-sans text-[0.65rem] text-brand-slate">
            {idea.authorName || idea.author} · {when}
            {idea.editedAt && ' · edited'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-md border border-brand-pale-dusk px-3 py-1.5 font-sans text-[0.65rem] uppercase tracking-label text-brand-umber transition-colors hover:bg-brand-indigo/5"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => void deleteIdea(idea.id)}
              className="rounded-md border border-brand-pale-dusk px-3 py-1.5 font-sans text-[0.65rem] uppercase tracking-label text-brand-slate transition-colors hover:bg-red-50 hover:text-red-700"
            >
              Delete
            </button>
          )}
        </div>
      </header>

      <IdeaMarkdown markdown={idea.bodyMarkdown} />

      {isAdmin && (
        <footer className="mt-5 flex flex-wrap items-end gap-4 border-t border-brand-pale-dusk pt-4">
          <label className="flex flex-col gap-1 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
            Status
            <select
              value={idea.status}
              onChange={(e) => void setIdeaStatus(idea.id, e.target.value as IdeaStatus)}
              className="rounded-md border border-brand-pale-dusk bg-white px-2 py-1.5 text-sm normal-case tracking-normal text-brand-umber"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
            Tags
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              onBlur={commitTags}
              placeholder="comma, separated, tags"
              className="rounded-md border border-brand-pale-dusk bg-white px-2 py-1.5 text-sm normal-case tracking-normal text-brand-umber"
            />
          </label>
        </footer>
      )}
    </article>
  )
}

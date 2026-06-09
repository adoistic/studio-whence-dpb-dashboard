'use client'

import type { Idea } from '@/types/idea'
import { formatRelative } from '@/lib/dates'

const STATUS_DOT: Record<Idea['status'], string> = {
  new: 'bg-brand-gold',
  triaged: 'bg-brand-lavender',
  actioned: 'bg-brand-indigo',
  archived: 'bg-brand-slate',
}

const STATUS_LABEL: Record<Idea['status'], string> = {
  new: 'New',
  triaged: 'Triaged',
  actioned: 'Actioned',
  archived: 'Archived',
}

function firstLine(markdown: string): string {
  const line = markdown.split('\n').find((l) => l.trim().length > 0) ?? ''
  return line.replace(/^#+\s*/, '').replace(/[*_`>#-]/g, '').trim().slice(0, 80) || 'Untitled idea'
}

export function IdeaCard({
  idea,
  seen,
  selected,
  onSelect,
}: {
  idea: Idea
  seen: boolean
  selected?: boolean
  onSelect: (id: string) => void
}) {
  const when = idea.createdAt ? formatRelative(new Date(idea.createdAt.toMillis()).toISOString()) : 'just now'
  const heading = idea.title?.trim() || firstLine(idea.bodyMarkdown)

  return (
    <button
      type="button"
      onClick={() => onSelect(idea.id)}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-brand-indigo bg-brand-indigo/5'
          : 'border-brand-pale-dusk bg-white/60 hover:bg-brand-indigo/5'
      }`}
    >
      {!seen && (
        <span
          aria-label="unread"
          className="inline-block h-2 w-2 shrink-0 rounded-full bg-brand-indigo"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-brand-umber">{heading}</span>
        <span className="block truncate font-sans text-[0.65rem] text-brand-slate">
          {idea.authorName || idea.author} · {when}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-pale-dusk bg-brand-pale-dusk/40 px-2 py-0.5">
        <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[idea.status]}`} />
        <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-umber">
          {STATUS_LABEL[idea.status]}
        </span>
      </span>
    </button>
  )
}

'use client'

import { useMemo, useState } from 'react'
import type { Idea } from '@/types/idea'
import { type AllowStatus } from '@/lib/auth'
import { markIdeaSeen } from '@/lib/ideas'
import { IdeaCard } from '@/components/ideas/IdeaCard'
import { IdeaView } from '@/components/ideas/IdeaView'

export interface DateGroup {
  date: Date
  label: string
  items: Idea[]
}

/** ms for an idea, treating a null/pending createdAt as "now" (today). */
function ideaMillis(idea: Idea): number {
  return idea.createdAt ? idea.createdAt.toMillis() : Date.now()
}

/** A calendar-day bucket key (local time), e.g. "Mon Jun 09 2026". */
function dayKey(ms: number): string {
  return new Date(ms).toDateString()
}

/**
 * Group ideas into calendar-day buckets. Groups are ordered newest-first and
 * items within a group are newest-first. Pure over Firestore `{toMillis}` —
 * a null createdAt (pending write) buckets into "today".
 */
export function groupByDate(ideas: Idea[]): DateGroup[] {
  const buckets = new Map<string, Idea[]>()
  for (const idea of ideas) {
    const key = dayKey(ideaMillis(idea))
    const arr = buckets.get(key)
    if (arr) arr.push(idea)
    else buckets.set(key, [idea])
  }
  const groups: DateGroup[] = []
  for (const items of buckets.values()) {
    items.sort((a, b) => ideaMillis(b) - ideaMillis(a))
    const date = new Date(ideaMillis(items[0]))
    groups.push({
      date,
      label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      items,
    })
  }
  groups.sort((a, b) => b.date.getTime() - a.date.getTime())
  return groups
}

export function IdeaInbox({
  ideas,
  seen,
  role,
  viewerEmail,
}: {
  ideas: Idea[]
  seen: Record<string, boolean>
  role: AllowStatus
  viewerEmail: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [senderFilter, setSenderFilter] = useState<string>('all')

  const tagOptions = useMemo(() => {
    const set = new Set<string>()
    for (const i of ideas) for (const t of i.tags) set.add(t)
    return Array.from(set).sort()
  }, [ideas])

  const senderOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const i of ideas) map.set(i.author, i.authorName || i.author)
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [ideas])

  const filtered = useMemo(
    () =>
      ideas.filter(
        (i) =>
          (statusFilter === 'all' || i.status === statusFilter) &&
          (tagFilter === 'all' || i.tags.includes(tagFilter)) &&
          (senderFilter === 'all' || i.author === senderFilter),
      ),
    [ideas, statusFilter, tagFilter, senderFilter],
  )

  const groups = useMemo(() => groupByDate(filtered), [filtered])
  const selected = ideas.find((i) => i.id === selectedId) ?? null

  const onSelect = (id: string) => {
    setSelectedId(id)
    if (viewerEmail) void markIdeaSeen(viewerEmail, id)
  }

  const selectClass =
    'rounded-md border border-brand-pale-dusk bg-white px-2 py-1.5 text-sm text-brand-umber'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="triaged">Triaged</option>
            <option value="actioned">Actioned</option>
            <option value="archived">Archived</option>
          </select>
          {tagOptions.length > 0 && (
            <select aria-label="Filter by tag" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className={selectClass}>
              <option value="all">All tags</option>
              {tagOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <select aria-label="Filter by sender" value={senderFilter} onChange={(e) => setSenderFilter(e.target.value)} className={selectClass}>
            <option value="all">All senders</option>
            {senderOptions.map(([email, name]) => (
              <option key={email} value={email}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-brand-pale-dusk px-3 py-6 text-center text-sm text-brand-slate">
            No ideas yet.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="flex flex-col gap-2">
              <h3 className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
                {group.label}
              </h3>
              {group.items.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  seen={!!seen[idea.id]}
                  selected={idea.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </section>
          ))
        )}
      </div>

      <div>
        {selected ? (
          <IdeaView idea={selected} role={role} viewerEmail={viewerEmail} />
        ) : (
          <p className="rounded-xl border border-dashed border-brand-pale-dusk px-4 py-12 text-center text-sm text-brand-slate">
            Select an idea to read it.
          </p>
        )}
      </div>
    </div>
  )
}

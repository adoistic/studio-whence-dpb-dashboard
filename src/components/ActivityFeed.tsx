import type { ActivityEntry } from '@/types/content'
import { formatRelative } from '@/lib/dates'

interface ActivityFeedProps {
  entries: ActivityEntry[]
  limit?: number
}

export function ActivityFeed({ entries, limit = 8 }: ActivityFeedProps) {
  const visible = entries.slice(0, limit)

  if (visible.length === 0) {
    return (
      <p className="font-serif text-brand-slate">No recent activity.</p>
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-brand-pale-dusk">
      {visible.map((entry) => (
        <li key={entry.sha} className="flex items-start gap-3 py-4">
          {/* Gold dot bullet */}
          <span
            data-testid="gold-dot"
            aria-hidden
            className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full bg-brand-gold"
          />

          <div className="flex flex-col gap-0.5 min-w-0">
            {/* Date stamp — Instrument Sans, uppercase, slate */}
            <span className="font-sans text-xs uppercase tracking-label text-brand-slate">
              {formatRelative(entry.date)}
            </span>

            {/* Title — Cormorant Garamond, indigo */}
            <span className="font-serif text-brand-indigo leading-snug">
              {entry.title}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

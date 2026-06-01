import type { ActivityEntry } from '@/types/content'
import { formatRelative } from '@/lib/dates'

interface ActivityFeedProps {
  entries: ActivityEntry[]
  limit?: number
}

export function ActivityFeed({ entries, limit = 8 }: ActivityFeedProps) {
  const visible = entries.slice(0, limit)

  if (visible.length === 0) {
    return <p className="font-serif text-brand-slate">No recent activity.</p>
  }

  return (
    <ul className="flex flex-col border-t border-brand-pale-dusk">
      {visible.map((entry) => (
        <li
          key={entry.sha}
          className="group grid grid-cols-[auto_1fr] sm:grid-cols-[10rem_1fr] items-baseline gap-x-5 gap-y-1
            border-b border-brand-pale-dusk py-5 transition-colors duration-200 hover:bg-brand-threshold/60"
        >
          {/* Left gutter: gold dot + relative date */}
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span
              data-testid="gold-dot"
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full bg-brand-gold
                transition-transform duration-200 group-hover:scale-150"
            />
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
              {formatRelative(entry.date)}
            </span>
          </span>

          {/* Entry title */}
          <span className="font-serif text-lg text-brand-indigo leading-snug">
            {entry.title}
          </span>
        </li>
      ))}
    </ul>
  )
}

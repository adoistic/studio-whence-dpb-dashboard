import type { ChangelogEntry } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'

interface VersionTimelineProps {
  changelog: ChangelogEntry[]
  version?: number
}

function normalizeEntry(entry: ChangelogEntry): { date?: string; note: string } {
  return typeof entry === 'string' ? { note: entry } : { date: entry.date, note: entry.note }
}

export function VersionTimeline({ changelog, version: _version }: VersionTimelineProps) {
  if (changelog.length === 0) return null

  // Build numbered rows (1-based) then reverse so newest is first.
  const rows = changelog
    .map((entry, i) => ({ versionNum: i + 1, ...normalizeEntry(entry) }))
    .reverse()

  const latestVersion = changelog.length

  return (
    <section className="flex flex-col gap-6 pt-16">
      <SectionHead kicker="History" title="Version history" />
      <ul className="flex flex-col gap-3">
        {rows.map(({ versionNum, date, note }) => (
          <li
            key={versionNum}
            className="flex items-baseline gap-3 font-serif text-brand-umber leading-relaxed"
          >
            <span className="shrink-0 tabular-nums text-brand-slate text-sm font-sans">
              v{versionNum}
            </span>
            {date && (
              <span className="shrink-0 tabular-nums text-brand-slate text-sm">{date}</span>
            )}
            <span className="flex-1">{note}</span>
            {versionNum === latestVersion && (
              <span className="font-sans text-[0.66rem] uppercase tracking-label text-brand-gold">
                · current
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

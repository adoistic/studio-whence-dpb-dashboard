/**
 * formatRelative — convert an ISO-8601 date string to a short human-readable
 * relative string, or an absolute short date for older entries.
 *
 * Rules:
 *   < 60 s      → "just now"
 *   < 60 min    → "N min ago"
 *   < 24 h      → "N hours ago" / "1 hour ago"
 *   < 7 days    → "N days ago" / "1 day ago"
 *   >= 7 days   → "30 May 2026" (en-GB short date)
 *
 * @param iso   ISO-8601 date string (offset is handled correctly by Date)
 * @param now   Reference date — defaults to new Date(). Pass an explicit value
 *              in tests to keep them deterministic.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const diffMs = now.getTime() - then.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  if (diffDays < 7) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`

  return then.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

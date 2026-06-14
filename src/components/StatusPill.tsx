import type { Status } from '@/types/content'

const STATUS_LABELS: Record<Status, string> = {
  draft: 'Draft',
  'in-review': 'In review',
  approved: 'Approved',
  published: 'Published',
  placeholder: 'Outlined',
}

const STATUS_DOT: Record<Status, string> = {
  draft: 'bg-brand-slate',
  'in-review': 'bg-brand-lavender',
  approved: 'bg-brand-gold',
  published: 'bg-brand-indigo',
  placeholder: 'bg-brand-pale-dusk',
}

export function StatusPill({ status }: { status: Status }) {
  // A solid light pill with dark indigo text — legible on BOTH the dark hero
  // masthead (where the old translucent-pale pill + muted-umber text was barely
  // readable, reading as a faint gold smudge) and on light listing pages.
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-pale-dusk bg-brand-cream px-2.5 py-1 shadow-sm">
      <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? 'bg-brand-slate'}`} />
      <span className="font-sans text-[0.65rem] font-semibold uppercase tracking-label text-brand-indigo">
        {STATUS_LABELS[status] ?? status}
      </span>
    </span>
  )
}

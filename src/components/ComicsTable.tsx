'use client'

// ComicsTable is a thin client wrapper that owns the Column definitions
// (which contain functions). Function props cannot cross the RSC server/client
// boundary, so they live here; LinePageShell (server) passes only serializable
// data (comics + filename).

import type { Comic, Status } from '@/types/content'
import { DataTable } from '@/components/DataTable'
import type { Column } from '@/components/DataTable'

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

function StatusPill({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-pale-dusk bg-brand-pale-dusk/40 px-2.5 py-1">
      <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? 'bg-brand-slate'}`} />
      <span className="font-sans text-[0.65rem] uppercase tracking-label text-brand-umber">
        {STATUS_LABELS[status] ?? status}
      </span>
    </span>
  )
}

const COMIC_COLUMNS: Column<Comic>[] = [
  {
    key: 'title',
    header: 'Comic',
    get: c => c.title,
    cell: c => (
      <div className="flex flex-col gap-0.5 max-w-md">
        <span className="leading-snug">{c.title}</span>
        {(c.subject || c.time_span) && (
          <span className="font-sans text-[0.68rem] uppercase tracking-label text-brand-slate">
            {[c.subject, c.time_span].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'series',
    header: 'Series',
    get: c => c.series ?? '',
    cell: c => <span className="text-brand-lavender">{c.series ?? '—'}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    get: c => c.status,
    cell: c => <StatusPill status={c.status} />,
  },
  {
    key: 'pages',
    header: 'Pages',
    get: c => c.target_length_pages ?? 0,
    cell: c => <span className="tabular-nums">{c.target_length_pages ?? '—'}</span>,
  },
  {
    key: 'updated',
    header: 'Updated',
    get: c => c.updated ?? '',
    cell: c => <span className="tabular-nums text-brand-slate">{c.updated ?? '—'}</span>,
  },
]

interface ComicsTableProps {
  comics: Comic[]
  filename: string
}

export function ComicsTable({ comics, filename }: ComicsTableProps) {
  return (
    <DataTable<Comic>
      rows={comics}
      columns={COMIC_COLUMNS}
      filename={filename}
      rowKey={c => c.slug}
    />
  )
}

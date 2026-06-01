'use client'

// ComicsTable is a thin client wrapper that owns the Column definitions
// (which contain functions). This is architecturally required: function props
// cannot be serialized across the RSC server/client boundary, so they must
// live in a client component. LinePageShell (server component) passes only
// serializable data (the comics array + filename string) to this wrapper,
// which then passes the complete Column<Comic>[] — including cell renderers
// and get accessors — to the generic DataTable.

import type { Comic, Status } from '@/types/content'
import { DataTable } from '@/components/DataTable'
import type { Column } from '@/components/DataTable'

const STATUS_LABELS: Record<Status, string> = {
  draft: 'Draft',
  'in-review': 'In Review',
  approved: 'Approved',
  published: 'Published',
  placeholder: 'Placeholder',
}

const STATUS_DOT: Record<Status, string> = {
  draft: 'bg-brand-slate',
  'in-review': 'bg-brand-lavender',
  approved: 'bg-brand-gold',
  published: 'bg-brand-indigo',
  placeholder: 'bg-brand-pale-dusk',
}

const COMIC_COLUMNS: Column<Comic>[] = [
  {
    key: 'title',
    header: 'Title',
    get: c => c.title,
    cell: c => (
      <span className="text-brand-indigo">{c.title}</span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    get: c => c.status,
    cell: c => (
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[c.status] ?? 'bg-brand-slate'}`}
        />
        <span>{STATUS_LABELS[c.status] ?? c.status}</span>
      </span>
    ),
  },
  {
    key: 'pages',
    header: 'Pages',
    get: c => c.target_length_pages ?? '',
  },
  {
    key: 'updated',
    header: 'Updated',
    get: c => c.updated ?? '',
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

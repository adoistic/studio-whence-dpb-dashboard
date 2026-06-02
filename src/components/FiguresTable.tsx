'use client'

import type { Figure } from '@/types/content'
import { DataTable } from '@/components/DataTable'
import type { Column } from '@/components/DataTable'

function titleCaseSlug(slug: string): string {
  return slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

const FIGURE_COLUMNS: Column<Figure>[] = [
  { key: 'name', header: 'Figure', get: f => titleCaseSlug(f.slug),
    cell: f => <span className="leading-snug">{titleCaseSlug(f.slug)}</span> },
  { key: 'series', header: 'Series', get: f => f.series,
    cell: f => <span className="text-brand-lavender">{f.series}</span> },
  { key: 'sources', header: 'Sources', get: f => f.sources_count,
    cell: f => <span className="tabular-nums">{f.sources_count}</span> },
  { key: 'words', header: 'Words', get: f => f.words,
    cell: f => <span className="tabular-nums text-brand-slate">{f.words.toLocaleString()}</span> },
]

export function FiguresTable({ figures, filename }: { figures: Figure[]; filename: string }) {
  return (
    <DataTable<Figure>
      rows={figures}
      columns={FIGURE_COLUMNS}
      filename={filename}
      rowKey={f => f.slug}
      rowHref={f => `/figures/${f.slug}`}
    />
  )
}

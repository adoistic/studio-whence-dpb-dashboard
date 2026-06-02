'use client'

import type { PersonRow } from '@/lib/people'
import { DataTable } from '@/components/DataTable'
import type { Column } from '@/components/DataTable'
import { StatusPill } from '@/components/StatusPill'

function StagePill({ row }: { row: PersonRow }) {
  return (
    <span className="inline-flex items-center gap-2">
      {row.stage === 'researched' ? (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-[0.65rem] uppercase tracking-label text-brand-slate">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-brand-pale-dusk" />
          Researched
        </span>
      ) : (
        <StatusPill status={row.stage} />
      )}
      {row.comicCount > 1 && (
        <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-gold">{row.comicCount} comics</span>
      )}
    </span>
  )
}

const PEOPLE_COLUMNS: Column<PersonRow>[] = [
  { key: 'name', header: 'Person', get: (p) => p.name, cell: (p) => <span className="leading-snug">{p.name}</span> },
  { key: 'series', header: 'Series', get: (p) => p.series, cell: (p) => <span className="text-brand-lavender">{p.series}</span> },
  { key: 'stage', header: 'Stage', get: (p) => p.stageRank, cell: (p) => <StagePill row={p} /> },
  { key: 'sources', header: 'Sources', get: (p) => p.sourcesCount ?? -1, cell: (p) => <span className="tabular-nums">{p.sourcesCount ?? '—'}</span> },
  { key: 'words', header: 'Words', get: (p) => p.words ?? -1, cell: (p) => <span className="tabular-nums text-brand-slate">{p.words != null ? p.words.toLocaleString() : '—'}</span> },
]

export function PeopleTable({ people, filename }: { people: PersonRow[]; filename: string }) {
  return (
    <DataTable<PersonRow>
      rows={people}
      columns={PEOPLE_COLUMNS}
      filename={filename}
      rowKey={(p) => p.slug}
      rowHref={(p) => p.href}
    />
  )
}

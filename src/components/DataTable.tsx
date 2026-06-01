'use client'

import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { CsvDownloadButton } from '@/components/CsvDownloadButton'

export type Column<T> = {
  key: string
  header: string
  get: (row: T) => string | number
  cell?: (row: T) => ReactNode
  sortable?: boolean
}

type SortDir = 'asc' | 'desc'

interface SortState {
  key: string
  dir: SortDir
}

interface DataTableProps<T> {
  rows: T[]
  columns: Column<T>[]
  filename: string
  rowKey?: (row: T) => string
}

export function DataTable<T>({ rows, columns, filename, rowKey }: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null)

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const col = columns.find(c => c.key === sort.key)
    if (!col) return rows
    return [...rows].sort((a, b) => {
      const va = col.get(a)
      const vb = col.get(b)
      let cmp: number
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb
      } else {
        cmp = String(va).localeCompare(String(vb))
      }
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, columns, sort])

  function handleHeaderClick(col: Column<T>) {
    if (col.sortable === false) return
    setSort(prev => {
      if (prev?.key === col.key) {
        return { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      }
      return { key: col.key, dir: 'asc' }
    })
  }

  function getRowKey(row: T, idx: number): string {
    if (rowKey) return rowKey(row)
    return String(idx)
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <CsvDownloadButton rows={rows} columns={columns} filename={filename} />
        </div>
        <p className="font-serif text-brand-slate">No entries yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Chrome: CSV download button top-right */}
      <div className="flex justify-end">
        <CsvDownloadButton rows={rows} columns={columns} filename={filename} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map(col => {
                const isSortable = col.sortable !== false
                const isActive = sort?.key === col.key
                const indicator = isActive
                  ? sort?.dir === 'asc' ? ' ▲' : ' ▼'
                  : ''
                return (
                  <th
                    key={col.key}
                    onClick={isSortable ? () => handleHeaderClick(col) : undefined}
                    className={
                      'font-sans text-xs uppercase tracking-label text-brand-slate ' +
                      'pb-3 text-left whitespace-nowrap ' +
                      (isSortable ? 'cursor-pointer select-none hover:text-brand-indigo' : '')
                    }
                  >
                    {col.header}{indicator}
                  </th>
                )
              })}
            </tr>
            {/* 28px gold rule under header band */}
            <tr aria-hidden>
              <td
                colSpan={columns.length}
                className="p-0"
                style={{ height: 2, background: 'var(--color-brand-gold, #c9a84c)', paddingBottom: 0 }}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-pale-dusk">
            {sortedRows.map((row, idx) => (
              <tr key={getRowKey(row, idx)}>
                {columns.map(col => (
                  <td
                    key={col.key}
                    className="font-serif text-brand-umber py-3 pr-6 text-sm align-top"
                  >
                    {col.cell ? col.cell(row) : String(col.get(row))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

'use client'

import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
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
  rowHref?: (row: T) => string
}

export function DataTable<T>({ rows, columns, filename, rowKey, rowHref }: DataTableProps<T>) {
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
        <p className="font-serif italic text-brand-slate">No entries yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Chrome: row count + CSV download */}
      <div className="flex items-center justify-between">
        <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
          {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
        </span>
        <CsvDownloadButton rows={rows} columns={columns} filename={filename} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-brand-gold">
              {columns.map(col => {
                const isSortable = col.sortable !== false
                const isActive = sort?.key === col.key
                const ariaSortValue = isSortable
                  ? isActive
                    ? sort?.dir === 'asc' ? 'ascending' : 'descending'
                    : 'none'
                  : undefined
                return (
                  <th
                    key={col.key}
                    aria-sort={ariaSortValue}
                    className="px-4 first:pl-1 pb-3 text-left align-bottom"
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() => handleHeaderClick(col)}
                        className="inline-flex items-center gap-1.5 cursor-pointer select-none font-sans text-[0.7rem] uppercase tracking-label text-brand-slate transition-colors hover:text-brand-indigo"
                      >
                        {col.header}
                        <span aria-hidden className={`text-[0.6rem] ${isActive ? 'text-brand-gold' : 'text-transparent'}`}>
                          {sort?.dir === 'asc' ? '▲' : '▼'}
                        </span>
                      </button>
                    ) : (
                      <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
                        {col.header}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-pale-dusk">
            {sortedRows.map((row, idx) => (
              <tr
                key={getRowKey(row, idx)}
                className="transition-colors duration-150 hover:bg-brand-threshold/70"
              >
                {columns.map((col, ci) => {
                  const content = col.cell ? col.cell(row) : String(col.get(row))
                  return (
                    <td
                      key={col.key}
                      className={`px-4 first:pl-1 py-4 align-top font-serif ${
                        ci === 0 ? 'text-brand-indigo text-[1.05rem] leading-snug' : 'text-brand-umber text-sm'
                      }`}
                    >
                      {ci === 0 && rowHref ? (
                        <Link href={rowHref(row)} className="transition-opacity hover:opacity-70">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

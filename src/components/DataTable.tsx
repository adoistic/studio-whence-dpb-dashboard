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

// An opt-in dropdown filter over one facet of the rows. Options are derived
// from the (unfiltered) rows when not supplied, so the menu stays stable
// while a selection narrows the table.
export type TableFilter<T> = {
  key: string
  label: string
  get: (row: T) => string
  options?: { value: string; label: string }[]
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
  // Opt-in chrome — omitted by existing tables, so their behavior is unchanged.
  searchable?: boolean
  searchPlaceholder?: string
  filters?: TableFilter<T>[]
}

export function DataTable<T>({
  rows,
  columns,
  filename,
  rowKey,
  rowHref,
  searchable,
  searchPlaceholder,
  filters,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Record<string, string>>({})

  const hasToolbar = Boolean(searchable || (filters && filters.length > 0))
  const activeQuery = query.trim().toLowerCase()
  const activeFilters = (filters ?? []).filter(f => (picked[f.key] ?? 'all') !== 'all')
  const isNarrowed = activeQuery !== '' || activeFilters.length > 0

  // Menu options come from the FULL row set so choosing one never empties the menus.
  const filterOptions = useMemo(() => {
    const out: Record<string, { value: string; label: string }[]> = {}
    for (const f of filters ?? []) {
      out[f.key] =
        f.options ??
        [...new Set(rows.map(r => f.get(r)))]
          .sort((a, b) => a.localeCompare(b))
          .map(v => ({ value: v, label: v }))
    }
    return out
  }, [rows, filters])

  const filteredRows = useMemo(() => {
    let out = rows
    if (activeQuery) {
      out = out.filter(r => columns.some(c => String(c.get(r)).toLowerCase().includes(activeQuery)))
    }
    for (const f of activeFilters) {
      const want = picked[f.key]
      out = out.filter(r => f.get(r) === want)
    }
    return out
  }, [rows, columns, activeQuery, activeFilters, picked])

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows
    const col = columns.find(c => c.key === sort.key)
    if (!col) return filteredRows
    return [...filteredRows].sort((a, b) => {
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
  }, [filteredRows, columns, sort])

  function resetNarrowing() {
    setQuery('')
    setPicked({})
  }

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
      {/* Chrome: search + facet filters (opt-in) */}
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-3">
          {searchable && (
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchPlaceholder ?? 'Search…'}
              aria-label={searchPlaceholder ?? 'Search'}
              className="w-full max-w-xs rounded-full border border-brand-pale-dusk bg-white/70 px-4 py-1.5 font-sans text-sm text-brand-indigo placeholder:text-brand-slate/70 focus:border-brand-gold focus:outline-none"
            />
          )}
          {(filters ?? []).map(f => (
            <label key={f.key} className="inline-flex items-center gap-2 font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
              {f.label}
              <select
                value={picked[f.key] ?? 'all'}
                onChange={e => setPicked(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="cursor-pointer rounded-full border border-brand-pale-dusk bg-white/70 px-3 py-1.5 font-sans text-[0.72rem] normal-case tracking-normal text-brand-indigo focus:border-brand-gold focus:outline-none"
              >
                <option value="all">All</option>
                {(filterOptions[f.key] ?? []).map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {isNarrowed && (
            <button
              type="button"
              onClick={resetNarrowing}
              className="cursor-pointer font-sans text-[0.7rem] uppercase tracking-label text-brand-gold transition-colors hover:text-brand-indigo"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Chrome: row count + CSV download */}
      <div className="flex items-center justify-between">
        <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
          {isNarrowed
            ? `${filteredRows.length} of ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`
            : `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`}
        </span>
        <CsvDownloadButton rows={sortedRows} columns={columns} filename={filename} />
      </div>

      {/* Narrowed to nothing — keep the chrome so the reset is one click away */}
      {isNarrowed && filteredRows.length === 0 && (
        <p className="font-serif italic text-brand-slate">
          No matches.{' '}
          <button
            type="button"
            onClick={resetNarrowing}
            className="cursor-pointer font-serif not-italic text-brand-gold underline-offset-2 transition-colors hover:text-brand-indigo hover:underline"
          >
            Reset the filters
          </button>
          .
        </p>
      )}

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

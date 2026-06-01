'use client'

import type { Column } from '@/components/DataTable'
import { buildCsv } from '@/lib/csv'

interface CsvDownloadButtonProps<T> {
  rows: T[]
  columns: Column<T>[]
  filename: string
}

export function CsvDownloadButton<T>({ rows, columns, filename }: CsvDownloadButtonProps<T>) {
  function handleClick() {
    const csv = buildCsv(rows, columns)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="font-sans text-xs uppercase tracking-label text-brand-slate hover:text-brand-indigo transition-colors"
    >
      ↓ Download CSV
    </button>
  )
}

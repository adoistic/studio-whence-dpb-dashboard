import type { Column } from '@/components/DataTable'

/**
 * Build an RFC-4180 CSV string from rows and column definitions.
 * - Header row is built from column.header values.
 * - Each data row uses column.get(row) to extract values.
 * - Fields are quoted when they contain: comma, double quote, newline, or
 *   leading/trailing space.
 * - Double quotes inside a field are escaped by doubling them.
 * - null/undefined/empty coerce to "" (empty field, positionally present).
 * - Rows are joined with CRLF (\r\n) per RFC-4180.
 */

function quoteField(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value)
  // Must quote if contains comma, double quote, newline, or leading/trailing space
  const needsQuoting =
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r') ||
    str !== str.trim()
  if (needsQuoting) {
    // Escape inner double quotes by doubling
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export function buildCsv<T>(rows: T[], columns: Column<T>[]): string {
  const headerRow = columns.map(c => quoteField(c.header)).join(',')
  const dataRows = rows.map(row =>
    columns.map(c => quoteField(c.get(row))).join(',')
  )
  return [headerRow, ...dataRows].join('\r\n') + '\r\n'
}

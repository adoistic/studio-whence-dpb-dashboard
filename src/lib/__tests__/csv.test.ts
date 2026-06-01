import { buildCsv } from '@/lib/csv'
import type { Column } from '@/components/DataTable'

type Row = { name: string; value: string | number | null | undefined }

const cols: Column<Row>[] = [
  { key: 'name', header: 'Name', get: r => r.name },
  { key: 'value', header: 'Value', get: r => r.value ?? '' },
]

describe('buildCsv', () => {
  test('header row contains correct column headers', () => {
    const csv = buildCsv([], cols)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Name,Value')
  })

  test('plain value is unquoted', () => {
    const csv = buildCsv([{ name: 'Alice', value: 'hello' }], cols)
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('Alice,hello')
  })

  test('value containing a comma gets quoted', () => {
    const csv = buildCsv([{ name: 'Bob', value: 'hello, world' }], cols)
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('Bob,"hello, world"')
  })

  test('value containing a double quote gets the quote doubled and field quoted', () => {
    const csv = buildCsv([{ name: 'Carol', value: 'say "hi"' }], cols)
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('Carol,"say ""hi"""')
  })

  test('value containing a newline gets quoted', () => {
    const csv = buildCsv([{ name: 'Dave', value: 'line1\nline2' }], cols)
    const lines = csv.split('\r\n')
    // The field itself contains \n — the outer structure is CRLF
    expect(lines[1]).toBe('Dave,"line1\nline2"')
  })

  test('null/undefined coerces to empty field (positionally present)', () => {
    const csv = buildCsv([{ name: 'Eve', value: null }], cols)
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('Eve,')
  })

  test('undefined value coerces to empty field', () => {
    const csv = buildCsv([{ name: 'Frank', value: undefined }], cols)
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('Frank,')
  })

  test('number value stringifies normally', () => {
    const csv = buildCsv([{ name: 'Grace', value: 42 }], cols)
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('Grace,42')
  })

  test('rows are joined with CRLF', () => {
    const csv = buildCsv(
      [{ name: 'A', value: '1' }, { name: 'B', value: '2' }],
      cols
    )
    // Should contain CRLF between every row
    expect(csv).toContain('\r\n')
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Name,Value')
    expect(lines[1]).toBe('A,1')
    expect(lines[2]).toBe('B,2')
  })
})

import { render, screen, fireEvent } from '@testing-library/react'
import { DataTable } from '../DataTable'
import type { Column } from '../DataTable'

type Item = { id: string; name: string; score: number }

const cols: Column<Item>[] = [
  { key: 'name', header: 'Name', get: r => r.name },
  { key: 'score', header: 'Score', get: r => r.score },
]

const rows: Item[] = [
  { id: '1', name: 'Banana', score: 30 },
  { id: '2', name: 'Apple', score: 10 },
  { id: '3', name: 'Cherry', score: 20 },
]

describe('DataTable', () => {
  test('renders column headers', () => {
    render(<DataTable rows={rows} columns={cols} filename="test.csv" rowKey={r => r.id} />)
    expect(screen.getByText('Name')).toBeVisible()
    expect(screen.getByText('Score')).toBeVisible()
  })

  test('renders all row values', () => {
    render(<DataTable rows={rows} columns={cols} filename="test.csv" rowKey={r => r.id} />)
    expect(screen.getByText('Banana')).toBeVisible()
    expect(screen.getByText('Apple')).toBeVisible()
    expect(screen.getByText('Cherry')).toBeVisible()
    expect(screen.getByText('30')).toBeVisible()
    expect(screen.getByText('10')).toBeVisible()
    expect(screen.getByText('20')).toBeVisible()
  })

  test('clicking a sortable header sorts rows ascending', () => {
    render(<DataTable rows={rows} columns={cols} filename="test.csv" rowKey={r => r.id} />)
    const nameHeader = screen.getByText('Name')
    fireEvent.click(nameHeader)
    // After asc sort: Apple, Banana, Cherry
    const cells = screen.getAllByRole('cell')
    const nameCells = cells.filter((_, i) => i % 2 === 0)
    expect(nameCells[0].textContent).toBe('Apple')
    expect(nameCells[1].textContent).toBe('Banana')
    expect(nameCells[2].textContent).toBe('Cherry')
  })

  test('clicking a sorted header twice reverses to descending', () => {
    render(<DataTable rows={rows} columns={cols} filename="test.csv" rowKey={r => r.id} />)
    const nameHeader = screen.getByText('Name')
    fireEvent.click(nameHeader)
    fireEvent.click(nameHeader)
    // After desc sort: Cherry, Banana, Apple
    const cells = screen.getAllByRole('cell')
    const nameCells = cells.filter((_, i) => i % 2 === 0)
    expect(nameCells[0].textContent).toBe('Cherry')
    expect(nameCells[1].textContent).toBe('Banana')
    expect(nameCells[2].textContent).toBe('Apple')
  })

  test('numeric sort works correctly', () => {
    render(<DataTable rows={rows} columns={cols} filename="test.csv" rowKey={r => r.id} />)
    const scoreHeader = screen.getByText('Score')
    fireEvent.click(scoreHeader)
    // After asc sort: 10, 20, 30
    const cells = screen.getAllByRole('cell')
    const scoreCells = cells.filter((_, i) => i % 2 === 1)
    expect(scoreCells[0].textContent).toBe('10')
    expect(scoreCells[1].textContent).toBe('20')
    expect(scoreCells[2].textContent).toBe('30')
  })

  test('empty rows renders "No entries yet." message', () => {
    render(<DataTable rows={[]} columns={cols} filename="empty.csv" />)
    expect(screen.getByText('No entries yet.')).toBeVisible()
  })

  test('Download CSV button is present', () => {
    render(<DataTable rows={rows} columns={cols} filename="test.csv" rowKey={r => r.id} />)
    expect(screen.getByText(/Download CSV/i)).toBeVisible()
  })

  test('sortable column header is keyboard-operable (exposed as a button)', () => {
    render(<DataTable rows={rows} columns={cols} filename="test.csv" rowKey={r => r.id} />)
    expect(screen.getByRole('button', { name: /Name/i })).toBeInTheDocument()
  })
})

describe('DataTable search + filters (opt-in)', () => {
  const filters = [
    { key: 'band', label: 'Band', get: (r: Item) => (r.score >= 20 ? 'high' : 'low') },
  ]

  test('no toolbar renders unless opted in', () => {
    render(<DataTable rows={rows} columns={cols} filename="t.csv" rowKey={r => r.id} />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  test('search narrows rows and the count shows n of m', () => {
    render(<DataTable rows={rows} columns={cols} filename="t.csv" rowKey={r => r.id} searchable />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ban' } })
    expect(screen.getByText('Banana')).toBeVisible()
    expect(screen.queryByText('Apple')).not.toBeInTheDocument()
    expect(screen.getByText('1 of 3 entries')).toBeVisible()
  })

  test('a facet filter narrows rows; Reset restores everything', () => {
    render(<DataTable rows={rows} columns={cols} filename="t.csv" rowKey={r => r.id} filters={filters} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'low' } })
    expect(screen.getByText('Apple')).toBeVisible()
    expect(screen.queryByText('Banana')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByText('Banana')).toBeVisible()
    expect(screen.getByText('3 entries')).toBeVisible()
  })

  test('narrowing to zero shows the no-matches reset affordance', () => {
    render(<DataTable rows={rows} columns={cols} filename="t.csv" rowKey={r => r.id} searchable />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText(/no matches/i)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /reset the filters/i }))
    expect(screen.getByText('Banana')).toBeVisible()
  })
})

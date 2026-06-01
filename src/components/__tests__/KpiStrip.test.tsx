import { render, screen } from '@testing-library/react'
import { KpiStrip } from '../KpiStrip'

test('KpiStrip renders four KPI tiles with numbers + labels', () => {
  render(<KpiStrip kpis={[
    { label: 'figures researched', value: 48 },
    { label: 'comics in production', value: 27 },
    { label: 'words on file', value: 10_000_000, formatter: 'million' },
    { label: 'lines active', value: 4 },
  ]} />)
  expect(screen.getByText('48')).toBeVisible()
  expect(screen.getByText(/figures researched/i)).toBeVisible()
  expect(screen.getByText(/10\s*million/i)).toBeVisible()
})

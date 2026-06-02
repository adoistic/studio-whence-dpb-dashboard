import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoadingState, ErrorState, NotFoundState } from '../QuietStates'

describe('QuietStates', () => {
  test('LoadingState announces via role=status', () => {
    render(<LoadingState />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
  test('ErrorState has a role=alert region and visible copy', () => {
    render(<ErrorState />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/couldn.t load/i, { selector: 'p' })).toBeInTheDocument()
  })
  test('NotFoundState renders the given title + detail under role=status', () => {
    render(<NotFoundState title="Comic not found" detail={'No comic matches “x/y”.'} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Comic not found')).toBeInTheDocument()
    expect(screen.getByText(/no comic matches/i)).toBeInTheDocument()
  })
})

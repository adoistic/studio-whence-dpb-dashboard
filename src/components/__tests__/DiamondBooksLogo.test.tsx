import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiamondBooksLogo } from '../DiamondBooksLogo'

describe('DiamondBooksLogo', () => {
  test('renders the Diamond Books brand asset with accessible alt text', () => {
    render(<DiamondBooksLogo />)
    const img = screen.getByAltText('Diamond Books')
    expect(img).toHaveAttribute('src', '/brand/diamond-books.png')
  })

  test('onDark wraps the logo in a white chip so the red/black wordmark stays legible on the violet footer', () => {
    render(<DiamondBooksLogo onDark />)
    const img = screen.getByAltText('Diamond Books')
    // The light backing chip is the img's wrapping span.
    expect(img.parentElement?.className).toMatch(/bg-white/)
  })

  test('light variant (default) renders the logo without a backing chip', () => {
    render(<DiamondBooksLogo />)
    const img = screen.getByAltText('Diamond Books')
    expect(img.parentElement?.className ?? '').not.toMatch(/bg-white/)
  })
})

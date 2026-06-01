import { render, screen } from '@testing-library/react'
import { LineCard } from '../LineCard'
import type { Line } from '@/types/content'

const fakeLine: Line = {
  slug: 'biographies',
  title: 'Biographies',
  subtitle: 'Forty-eight researched lives, told in panels.',
  comics: [
    {
      title: 'The Polyester Dream',
      slug: 'the-polyester-dream',
      subject_slug: 'dhirubhai-ambani',
      line: 'biographies',
      status: 'draft',
    },
    {
      title: 'Empire Builder',
      slug: 'empire-builder',
      subject_slug: 'dhirubhai-ambani',
      line: 'biographies',
      status: 'in-review',
    },
  ],
  figures: [],
}

describe('LineCard', () => {
  test('renders the line title', () => {
    render(<LineCard line={fakeLine} />)
    expect(screen.getByText('Biographies')).toBeVisible()
  })

  test('link href points to /biographies', () => {
    render(<LineCard line={fakeLine} />)
    const anchor = screen.getByRole('link')
    expect(anchor).toHaveAttribute('href', '/biographies')
  })

  test('renders the correct in-production count', () => {
    render(<LineCard line={fakeLine} />)
    expect(screen.getByText('2 in production')).toBeVisible()
  })

  test('link has accessible name "View Biographies"', () => {
    render(<LineCard line={fakeLine} />)
    expect(screen.getByRole('link', { name: 'View Biographies' })).toBeInTheDocument()
  })
})

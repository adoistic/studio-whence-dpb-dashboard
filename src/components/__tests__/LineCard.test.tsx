import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LineCard } from '../LineCard'
import type { Line } from '@/types/content'

// LineCard resolves its banner image via useResolved. Default mock returns the
// resolved URL for the biographies banner key so the <img> branch renders; a
// test below overrides it to {} to exercise the typographic-plate fallback.
const BANNER_KEY = 'images/characters/little-chanakya/little-chanakya-turnaround.jpg'
const mockUseResolved = vi.fn<(keys: string[]) => Record<string, string>>(
  () => ({ [BANNER_KEY]: 'https://signed/banner' })
)
vi.mock('@/lib/useResolved', () => ({
  useResolved: (keys: string[]) => mockUseResolved(keys),
}))

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
  beforeEach(() => {
    mockUseResolved.mockReset()
    mockUseResolved.mockReturnValue({ [BANNER_KEY]: 'https://signed/banner' })
  })

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

  test('renders the banner <img> when the key resolves', () => {
    render(<LineCard line={fakeLine} />)
    const img = document.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', 'https://signed/banner')
  })

  test('falls back to the typographic plate when the key has not resolved', () => {
    mockUseResolved.mockReturnValue({})
    render(<LineCard line={fakeLine} />)
    expect(document.querySelector('img')).toBeNull()
    // The plate shows the first letter of the line title.
    expect(screen.getByText('B')).toBeVisible()
  })
})

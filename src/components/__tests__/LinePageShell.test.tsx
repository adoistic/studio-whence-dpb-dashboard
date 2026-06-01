import { render, screen } from '@testing-library/react'
import { LinePageShell } from '../LinePageShell'
import type { Line } from '@/types/content'

const fakeBioLine: Line = {
  slug: 'biographies',
  title: 'Biographies',
  subtitle: 'Little Chanakya Presents…',
  comics: [
    {
      title: 'The Polyester Dream',
      slug: 'the-polyester-dream',
      subject_slug: 'dhirubhai-ambani',
      line: 'biographies',
      status: 'draft',
    },
  ],
  figures: [
    { series: 'Business Maharajas', slug: 'dhirubhai-ambani', sources_count: 5, words: 120000 },
    { series: 'Business Maharajas', slug: 'ratan-tata', sources_count: 8, words: 200000 },
    { series: 'Tech Legends', slug: 'steve-jobs', sources_count: 6, words: 150000 },
  ],
}

const fakeAwarenessLine: Line = {
  slug: 'awareness',
  title: 'Awareness',
  subtitle: 'Short comics for kids and teens.',
  comics: [],
  figures: [],
}

describe('LinePageShell', () => {
  test('renders the line title heading', () => {
    render(
      <LinePageShell
        line={fakeBioLine}
        introMdx={<p>Test intro copy.</p>}
      />
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Biographies' })).toBeVisible()
  })

  test('renders the line subtitle', () => {
    render(
      <LinePageShell
        line={fakeBioLine}
        introMdx={<p>Test intro copy.</p>}
      />
    )
    expect(screen.getByText('Little Chanakya Presents…')).toBeVisible()
  })

  test('renders the intro MDX content', () => {
    render(
      <LinePageShell
        line={fakeBioLine}
        introMdx={<p>Test intro copy.</p>}
      />
    )
    expect(screen.getByText('Test intro copy.')).toBeVisible()
  })

  test('biographies line WITH figures shows research summary', () => {
    render(
      <LinePageShell
        line={fakeBioLine}
        introMdx={<p>Test intro copy.</p>}
      />
    )
    expect(screen.getByText('figures researched')).toBeVisible()
    expect(screen.getByText('3')).toBeVisible()
  })

  test('non-biographies line does NOT show research summary', () => {
    render(
      <LinePageShell
        line={fakeAwarenessLine}
        introMdx={<p>Test intro copy.</p>}
      />
    )
    expect(screen.queryByText(/figures researched/)).not.toBeInTheDocument()
  })

  test('biographies line with no figures does NOT show research summary', () => {
    const bioLineNoFigures: Line = { ...fakeBioLine, figures: [] }
    render(
      <LinePageShell
        line={bioLineNoFigures}
        introMdx={<p>Test intro copy.</p>}
      />
    )
    expect(screen.queryByText(/figures researched/)).not.toBeInTheDocument()
  })
})

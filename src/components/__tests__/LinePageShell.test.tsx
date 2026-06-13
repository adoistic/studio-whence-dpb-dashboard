import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LinePageShell } from '../LinePageShell'
import type { Line } from '@/types/content'

// LinePageShell resolves its masthead image via useResolved. The tests don't
// depend on the masthead image, so an empty map (nothing resolved) is fine.
vi.mock('@/lib/useResolved', () => ({
  useResolved: () => ({}),
}))

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

// ComicAnalysisTab self-fetches the Medikidz embed via the gated dataApi; stub it
// so the medicomics tab tests don't reach the network.
vi.mock('../ComicAnalysisTab', () => ({
  ComicAnalysisTab: () => <div data-testid="comic-analysis-tab">analysis</div>,
}))

const fakeAwarenessLine: Line = {
  slug: 'awareness',
  title: 'Awareness',
  subtitle: 'Short comics for kids and teens.',
  comics: [
    {
      title: 'Clear the Air',
      slug: 'clear-the-air',
      subject_slug: '',
      line: 'awareness',
      status: 'draft',
    },
  ],
  figures: [],
}

const fakeMedicomicsLine: Line = {
  slug: 'medicomics',
  title: 'Medical Comics',
  subtitle: 'Little Chanakya MediComics.',
  comics: [],
  figures: [
    { series: 'MediComics', slug: 'obesity', sources_count: 4, words: 80000 },
    { series: 'MediComics', slug: 'breast-cancer', sources_count: 5, words: 90000 },
    { series: 'MediComics', slug: 'lung-cancer', sources_count: 5, words: 90000 },
    { series: 'MediComics', slug: 'adhd', sources_count: 3, words: 60000 },
    { series: 'MediComics', slug: 'autism', sources_count: 3, words: 60000 },
  ],
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

  // ── medicomics figure model ───────────────────────────────────────────────
  test('medicomics line renders the 5 disease rows AND a Comic Analysis tab', () => {
    render(
      <LinePageShell
        line={fakeMedicomicsLine}
        introMdx={<p>Test intro copy.</p>}
      />
    )
    // The 5 diseases render as figure rows (title-cased from their slugs).
    expect(screen.getByText('Obesity')).toBeVisible()
    expect(screen.getByText('Breast Cancer')).toBeVisible()
    expect(screen.getByText('Lung Cancer')).toBeVisible()
    expect(screen.getByText('Adhd')).toBeVisible()
    expect(screen.getByText('Autism')).toBeVisible()
    // The tab bar exposes a "Comic Analysis" tab alongside the default "Diseases".
    expect(screen.getByRole('tablist', { name: 'Line view' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Diseases' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Comic Analysis' })).toBeVisible()
    // 5 figures → the figure-count stat shows (the stat value sits as the
    // previous sibling of its "figures researched" label).
    const figuresLabel = screen.getByText('figures researched')
    expect(figuresLabel).toBeVisible()
    expect(figuresLabel.previousElementSibling).toHaveTextContent('5')
  })

  test('biographies line still renders its PeopleTable and NO tab bar', () => {
    render(
      <LinePageShell
        line={fakeBioLine}
        introMdx={<p>Test intro copy.</p>}
      />
    )
    // PeopleTable rows present (a figure from the fixture, title-cased).
    expect(screen.getByText('Ratan Tata')).toBeVisible()
    // No tab bar on biographies.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  test('awareness line renders the ComicsTable (no figures, no tab bar)', () => {
    render(
      <LinePageShell
        line={fakeAwarenessLine}
        introMdx={<p>Test intro copy.</p>}
      />
    )
    // The comics-in-production table header + a comic title.
    expect(screen.getByText('Comics in production')).toBeVisible()
    expect(screen.getByText('Clear the Air')).toBeVisible()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  test('neither the Research library nor a line-level AI conversations section renders', () => {
    render(
      <LinePageShell
        line={fakeMedicomicsLine}
        introMdx={<p>Test intro copy.</p>}
      />
    )
    expect(screen.queryByText(/AI conversations/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Research library/i)).not.toBeInTheDocument()
  })
})

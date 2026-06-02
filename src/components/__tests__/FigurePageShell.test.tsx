import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Figure } from '@/types/content'
import { FigurePageShell } from '../FigurePageShell'

vi.mock('@/components/ResearchReader', () => ({
  ResearchReader: ({ fileKey }: { fileKey: string | null }) => <div>reader:{fileKey ?? 'none'}</div>,
}))

const figure: Figure = {
  series: '01-Business-Legends',
  slug: 'dhirubhai-ambani',
  sources_count: 1,
  words: 1200,
  sources: [
    {
      slug: 'the-polyester-prince', kind: 'book', title: 'The Polyester Prince', words: 1200,
      files: [
        { path: 'biographies/01-Business-Legends/_books/dhirubhai-ambani/the-polyester-prince/chapters/01-intro.md', title: 'Intro' },
      ],
    },
  ],
}

const figureWithPodcasts: Figure = {
  ...figure,
  sources_count: 3,
  sources: [
    ...(figure.sources ?? []),
    {
      slug: 'pod-a', kind: 'transcript', title: 'ANI Podcast Ep 45', words: 9000,
      files: [{ path: 'p/a.md', title: 'Transcript' }],
    },
    {
      slug: 'pod-b', kind: 'transcript', title: 'Bush Center Forum', words: 9700,
      files: [{ path: 'p/b.md', title: 'Transcript' }],
    },
  ],
}

describe('FigurePageShell', () => {
  test('renders the masthead (title-cased name) + stats + source/file index', () => {
    render(<FigurePageShell figure={figure} />)
    expect(screen.getByRole('heading', { name: /dhirubhai ambani/i })).toBeInTheDocument()
    expect(screen.getByText('The Polyester Prince')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /intro/i })).toBeInTheDocument()
    expect(screen.getByText('reader:none')).toBeInTheDocument()  // nothing selected yet
  })
  test('selecting a file passes its research key to the reader', () => {
    render(<FigurePageShell figure={figure} />)
    fireEvent.click(screen.getByRole('button', { name: /intro/i }))
    expect(screen.getByText(/^reader:research\/biographies\/.*01-intro\.md$/)).toBeInTheDocument()
  })
  test('the active file button is marked aria-current="page"', () => {
    render(<FigurePageShell figure={figure} />)
    const button = screen.getByRole('button', { name: /intro/i })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-current', 'page')
  })
  test('a figure with no sources renders the empty note', () => {
    render(<FigurePageShell figure={{ ...figure, sources: [] }} />)
    expect(screen.getByText(/no sources indexed/i)).toBeInTheDocument()
  })

  test('all transcripts are grouped under one "Podcasts" group, labeled by source title', () => {
    render(<FigurePageShell figure={figureWithPodcasts} />)
    // The book group still renders on its own.
    expect(screen.getByRole('button', { name: /the polyester prince/i })).toBeInTheDocument()
    // One "Podcasts" group header.
    expect(screen.getByRole('button', { name: /podcasts/i })).toBeInTheDocument()
    // Both transcripts appear, labeled by their podcast/source title — not "Transcript".
    expect(screen.getByRole('button', { name: /ANI Podcast Ep 45/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bush Center Forum/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^transcript$/i })).not.toBeInTheDocument()
  })

  test('collapsing a book group hides its chapter children, expanding restores them', () => {
    render(<FigurePageShell figure={figure} />)
    expect(screen.getByRole('button', { name: /intro/i })).toBeInTheDocument()
    const header = screen.getByRole('button', { name: /the polyester prince/i })
    fireEvent.click(header)
    expect(screen.queryByRole('button', { name: /intro/i })).not.toBeInTheDocument()
    fireEvent.click(header)
    expect(screen.getByRole('button', { name: /intro/i })).toBeInTheDocument()
  })

  test('selecting a podcast transcript drives the reader with that transcript path', () => {
    render(<FigurePageShell figure={figureWithPodcasts} />)
    fireEvent.click(screen.getByRole('button', { name: /Bush Center Forum/i }))
    expect(screen.getByText('reader:research/p/b.md')).toBeInTheDocument()
  })
})

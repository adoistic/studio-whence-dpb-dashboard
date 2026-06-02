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
})

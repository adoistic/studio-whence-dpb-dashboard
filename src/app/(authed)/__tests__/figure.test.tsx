import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Content } from '@/types/content'
import FigurePage from '../figure/page'

let mockUseContent: () => { content: Content | null; loading: boolean; error?: Error }
vi.mock('@/lib/content', () => ({ useContent: () => mockUseContent() }))
vi.mock('@/components/FigurePageShell', () => ({
  FigurePageShell: ({ figure }: { figure: { slug: string } }) => <div>figure:{figure.slug}</div>,
}))

const fixture: Content = {
  generated_at: '', source_sha: 'test',
  headline: { figures_researched: 1, comics_in_production: 0, lines_active: 4 },
  lines: [
    { slug: 'biographies', title: 'Biographies', subtitle: '', comics: [],
      figures: [{ series: '01-Business-Legends', slug: 'dhirubhai-ambani', sources_count: 1, words: 10 }] },
  ],
  activity: [], images: [],
}

function setPathname(p: string) {
  Object.defineProperty(window, 'location', { value: { pathname: p }, writable: true, configurable: true })
}
beforeEach(() => setPathname('/'))

describe('FigurePage — /figures/<slug> routing', () => {
  test('renders the figure named by the second segment', () => {
    setPathname('/figures/dhirubhai-ambani')
    mockUseContent = () => ({ content: fixture, loading: false })
    render(<FigurePage />)
    expect(screen.getByText('figure:dhirubhai-ambani')).toBeInTheDocument()
  })
  test('resolves a mixed-case URL segment against a lowercase figure slug', () => {
    setPathname('/figures/Dhirubhai-Ambani')
    mockUseContent = () => ({ content: fixture, loading: false })
    render(<FigurePage />)
    expect(screen.getByText('figure:dhirubhai-ambani')).toBeInTheDocument()
  })
  test('unknown figure slug → not found', () => {
    setPathname('/figures/nobody')
    mockUseContent = () => ({ content: fixture, loading: false })
    render(<FigurePage />)
    expect(screen.getByText(/figure not found/i)).toBeInTheDocument()
  })
  test('loading state', () => {
    setPathname('/figures/dhirubhai-ambani')
    mockUseContent = () => ({ content: null, loading: true })
    render(<FigurePage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
  test('error state', () => {
    setPathname('/figures/dhirubhai-ambani')
    mockUseContent = () => ({ content: null, loading: false, error: new Error('boom') })
    render(<FigurePage />)
    expect(screen.getByText(/couldn.t load/i, { selector: 'p' })).toBeInTheDocument()
  })
})

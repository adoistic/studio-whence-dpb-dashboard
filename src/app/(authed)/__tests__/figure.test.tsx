import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Content } from '@/types/content'
import FigurePage from '../figure/page'

let mockUseContent: () => { content: Content | null; loading: boolean; error?: Error }
vi.mock('@/lib/content', () => ({ useContent: () => mockUseContent() }))
vi.mock('@/components/FigurePageShell', () => ({
  FigurePageShell: ({
    figure, initialFile = null, targetLine,
  }: { figure: { slug: string }; initialFile?: string | null; targetLine?: number }) => (
    <div>
      <div>figure:{figure.slug}</div>
      <div>{initialFile ? `reader:${initialFile}${targetLine != null ? `@${targetLine}` : ''}` : 'Select a chapter to read.'}</div>
    </div>
  ),
}))

const fixture: Content = {
  generated_at: '', source_sha: 'test',
  headline: { figures_researched: 1, comics_in_production: 0, lines_active: 4 },
  lines: [
    { slug: 'biographies', title: 'Biographies', subtitle: '', comics: [],
      figures: [{
        series: '01-Business-Legends', slug: 'dhirubhai-ambani', sources_count: 1, words: 10,
        sources: [{
          slug: 'the-polyester-prince', kind: 'book', title: 'The Polyester Prince', words: 10,
          files: [{ path: 'P/ch.md', title: 'Chapter' }],
        }],
      }] },
  ],
  activity: [], images: [],
}

function setPathname(p: string, search = '') {
  Object.defineProperty(window, 'location', { value: { pathname: p, search }, writable: true, configurable: true })
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
  test('passes a valid ?file=&line= through to the shell (file preselected)', () => {
    setPathname('/figures/dhirubhai-ambani', '?file=P/ch.md&line=42')
    mockUseContent = () => ({ content: fixture, loading: false })
    render(<FigurePage />)
    expect(screen.queryByText('Select a chapter to read.')).toBeNull()
    expect(screen.getByText('reader:P/ch.md@42')).toBeInTheDocument()
  })
  test('ignores a ?file= that is not one of the figure’s sources (placeholder shown)', () => {
    setPathname('/figures/dhirubhai-ambani', '?file=evil/path.md&line=42')
    mockUseContent = () => ({ content: fixture, loading: false })
    render(<FigurePage />)
    expect(screen.getByText('Select a chapter to read.')).toBeInTheDocument()
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

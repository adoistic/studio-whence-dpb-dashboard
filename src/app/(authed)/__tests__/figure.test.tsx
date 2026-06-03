import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Figure, ResearchSource } from '@/types/content'
import FigurePage from '../figure/page'

type FigureData = { figure: Figure; sources: ResearchSource[] }
let mockUseFigure: () => { data: FigureData | null; loading: boolean; error?: Error }
vi.mock('@/lib/catalog', () => ({ useFigure: () => mockUseFigure() }))
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

const sources: ResearchSource[] = [{
  slug: 'the-polyester-prince', kind: 'book', title: 'The Polyester Prince', words: 10,
  files: [{ path: 'P/ch.md', title: 'Chapter' }],
}]
const fixture: FigureData = {
  figure: {
    series: '01-Business-Legends', slug: 'dhirubhai-ambani', sources_count: 1, words: 10, sources,
  },
  sources,
}

function setPathname(p: string, search = '') {
  Object.defineProperty(window, 'location', { value: { pathname: p, search }, writable: true, configurable: true })
}
beforeEach(() => setPathname('/'))

describe('FigurePage — /figures/<slug> routing', () => {
  test('renders the figure named by the second segment', () => {
    setPathname('/figures/dhirubhai-ambani')
    mockUseFigure = () => ({ data: fixture, loading: false })
    render(<FigurePage />)
    expect(screen.getByText('figure:dhirubhai-ambani')).toBeInTheDocument()
  })
  test('resolves a mixed-case URL segment against a lowercase figure slug', () => {
    setPathname('/figures/Dhirubhai-Ambani')
    mockUseFigure = () => ({ data: fixture, loading: false })
    render(<FigurePage />)
    expect(screen.getByText('figure:dhirubhai-ambani')).toBeInTheDocument()
  })
  test('unknown figure slug (no doc) → not found', () => {
    setPathname('/figures/nobody')
    mockUseFigure = () => ({ data: null, loading: false })
    render(<FigurePage />)
    expect(screen.getByText(/figure not found/i)).toBeInTheDocument()
  })
  test('passes a valid ?file=&line= through to the shell (file preselected)', () => {
    setPathname('/figures/dhirubhai-ambani', '?file=P/ch.md&line=42')
    mockUseFigure = () => ({ data: fixture, loading: false })
    render(<FigurePage />)
    expect(screen.queryByText('Select a chapter to read.')).toBeNull()
    expect(screen.getByText('reader:P/ch.md@42')).toBeInTheDocument()
  })
  test('ignores a ?file= that is not one of the figure’s sources (placeholder shown)', () => {
    setPathname('/figures/dhirubhai-ambani', '?file=evil/path.md&line=42')
    mockUseFigure = () => ({ data: fixture, loading: false })
    render(<FigurePage />)
    expect(screen.getByText('Select a chapter to read.')).toBeInTheDocument()
  })
  test('loading state', () => {
    setPathname('/figures/dhirubhai-ambani')
    mockUseFigure = () => ({ data: null, loading: true })
    render(<FigurePage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
  test('error state', () => {
    setPathname('/figures/dhirubhai-ambani')
    mockUseFigure = () => ({ data: null, loading: false, error: new Error('boom') })
    render(<FigurePage />)
    expect(screen.getByText(/couldn.t load/i, { selector: 'p' })).toBeInTheDocument()
  })
})

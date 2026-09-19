import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeckReader } from '@/components/DeckReader'
import type { Comic } from '@/types/content'

const downloadKey = vi.hoisted(() => vi.fn())
vi.mock('@/lib/downloadDoc', () => ({ downloadKey }))

// Stand in for the gated /resolve route: every key resolves to a fake URL, so
// the viewer renders an <img> and the test can assert WHICH edition is showing.
vi.mock('@/lib/useResolved', () => ({
  useResolved: (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, `https://signed.example/${k}`])),
  refreshResolved: vi.fn(),
}))

const base = 'images/comics/medicomics/01-the-sugar-truth/deck'
const EN1 = `${base}/en/web/page-01.jpg`
const HI1 = `${base}/hi/web/page-01.jpg`

const comic = {
  line: 'medicomics',
  slug: '01-the-sugar-truth',
  title: 'The Sugar Truth',
  originalLanguage: 'en',
  editablePpt: { key: 'artifacts/…/en.pptx', bytes: 1, filename: 'EN.pptx' },
  translations: [{
    language: 'Hindi',
    editablePpt: { key: 'artifacts/…/hi.pptx', bytes: 1, filename: 'HI.pptx' },
  }],
  deckPages: {
    editions: [
      { language: 'English', code: 'en', count: 32 },
      { language: 'Hindi', code: 'hi', count: 32 },
    ],
  },
} as Comic

const frame = () => screen.getByAltText(/frame 1$/i) as HTMLImageElement

describe('DeckReader', () => {
  beforeEach(() => downloadKey.mockClear())

  test('reads the deck as pages, the same way the comic reader does', () => {
    render(<DeckReader comic={comic} />)
    // an <img> the viewer pages through — not an embedded PDF
    expect(frame()).toHaveAttribute('src', `https://signed.example/${EN1}`)
    expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open full screen/i })).toBeInTheDocument()
    expect(document.querySelector('iframe')).toBeNull()
  })

  test('switches the visible edition without leaving the page', () => {
    render(<DeckReader comic={comic} />)
    fireEvent.click(screen.getByRole('tab', { name: /hindi/i }))
    expect(frame()).toHaveAttribute('src', `https://signed.example/${HI1}`)
  })

  test('a language switch returns to page 1 of the new edition', () => {
    render(<DeckReader comic={comic} />)
    fireEvent.click(screen.getByRole('button', { name: /next page/i }))
    expect(screen.getByText('2 / 32')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /hindi/i }))
    expect(screen.getByText('1 / 32')).toBeInTheDocument()
  })

  test('opens in the original language even when it is not listed first', () => {
    // A Hindi original with an English translation — legacy/rajyog's shape.
    const hindiFirst = { ...comic, originalLanguage: 'hi' } as Comic
    render(<DeckReader comic={hindiFirst} />)
    expect(frame()).toHaveAttribute('src', `https://signed.example/${HI1}`)
  })

  test('downloads the .pptx for the edition on screen, not always the original', () => {
    render(<DeckReader comic={comic} />)
    fireEvent.click(screen.getByRole('tab', { name: /hindi/i }))
    fireEvent.click(screen.getByRole('button', { name: /download hindi/i }))
    expect(downloadKey).toHaveBeenCalledWith('artifacts/…/hi.pptx', 'HI.pptx')
  })

  test('renders nothing when no deck pages are published', () => {
    const { container } = render(
      <DeckReader comic={{ ...comic, deckPages: undefined } as Comic} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('an edition with no pages yet is not offered', () => {
    const half = {
      ...comic,
      deckPages: { editions: [
        { language: 'English', code: 'en', count: 32 },
        { language: 'Hindi', code: 'hi', count: 0 },
      ] },
    } as Comic
    render(<DeckReader comic={half} />)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(frame()).toHaveAttribute('src', `https://signed.example/${EN1}`)
  })
})

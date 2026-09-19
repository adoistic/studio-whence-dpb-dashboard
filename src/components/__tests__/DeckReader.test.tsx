import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeckReader } from '@/components/DeckReader'
import type { Comic } from '@/types/content'

const downloadKey = vi.hoisted(() => vi.fn())
vi.mock('@/lib/downloadDoc', () => ({ downloadKey }))

// Stand in for the gated /resolve route: every key resolves to a fake URL, so
// the iframe has a src and the test can assert WHICH edition is showing.
vi.mock('@/lib/useResolved', () => ({
  useResolved: (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, `https://signed.example/${k}`])),
  refreshResolved: vi.fn(),
}))

const EN = 'artifacts/comics/medicomics/01-the-sugar-truth/01-the-sugar-truth-editable.pdf'
const HI = 'artifacts/comics/medicomics/01-the-sugar-truth/01-the-sugar-truth-editable-hi.pdf'

const comic = {
  line: 'medicomics',
  slug: '01-the-sugar-truth',
  title: 'The Sugar Truth',
  originalLanguage: 'en',
  deckPdf: {
    editions: [
      { language: 'English', key: EN },
      { language: 'Hindi', key: HI },
    ],
  },
} as Comic

const frame = () => screen.getByTitle(/editable deck/i) as HTMLIFrameElement

describe('DeckReader', () => {
  beforeEach(() => downloadKey.mockClear())

  test('shows the deck inline, so a reader never has to download it first', () => {
    render(<DeckReader comic={comic} />)
    expect(frame()).toHaveAttribute('src', `https://signed.example/${EN}`)
  })

  test('switches the visible edition without leaving the page', () => {
    render(<DeckReader comic={comic} />)
    fireEvent.click(screen.getByRole('tab', { name: /हिंदी/ }))
    expect(frame()).toHaveAttribute('src', `https://signed.example/${HI}`)
  })

  test('opens in the original language even when it is not listed first', () => {
    // A Hindi original with an English translation — legacy/rajyog's shape.
    const hindiFirst = {
      ...comic,
      originalLanguage: 'hi',
      deckPdf: { editions: [{ language: 'English', key: EN }, { language: 'Hindi', key: HI }] },
    } as Comic
    render(<DeckReader comic={hindiFirst} />)
    expect(frame()).toHaveAttribute('src', `https://signed.example/${HI}`)
  })

  test('downloads the edition currently being read, not always the original', () => {
    render(<DeckReader comic={comic} />)
    fireEvent.click(screen.getByRole('tab', { name: /हिंदी/ }))
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }))
    expect(downloadKey).toHaveBeenCalledWith(HI, expect.stringContaining('hindi'))
  })

  test('renders nothing when the comic has no deck PDF', () => {
    const { container } = render(<DeckReader comic={{ ...comic, deckPdf: undefined } as Comic} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('a single-language deck still reads, with no switcher to choose from', () => {
    const one = { ...comic, deckPdf: { editions: [{ language: 'English', key: EN }] } } as Comic
    render(<DeckReader comic={one} />)
    expect(frame()).toHaveAttribute('src', `https://signed.example/${EN}`)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})

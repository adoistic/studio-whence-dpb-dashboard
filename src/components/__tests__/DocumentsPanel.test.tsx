import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Comic } from '@/types/content'
import { DocumentsPanel } from '../DocumentsPanel'

// Mock the download helper — assert it's called with the friendly filename.
const mockDownloadKey = vi.fn()
vi.mock('@/lib/downloadDoc', () => ({
  downloadKey: (...a: unknown[]) => mockDownloadKey(...a),
}))

// Mock the gated text reader — the inline reader renders whatever it returns.
let mockGated: () => { text: string | null; loading: boolean; error?: Error }
vi.mock('@/lib/useGatedText', () => ({ useGatedText: () => mockGated() }))

const baseComic: Comic = {
  title: 'The Polyester Dream',
  line: 'biographies',
  status: 'approved',
  slug: '01-the-polyester-dream',
  subject_slug: 'dhirubhai-ambani',
}

const comicWithDocs: Comic = {
  ...baseComic,
  docs: {
    generatedAt: '2026-06-05',
    items: [
      { type: 'concept-note', label: 'Concept note', readKey: 'docs/comics/biographies/dhirubhai-ambani/01-the-polyester-dream/concept-note.read.md', downloadKey: 'docs/comics/biographies/dhirubhai-ambani/01-the-polyester-dream/concept-note.download.md', bytes: 1200 },
      { type: 'sources-and-quotes', label: 'Sources & quotes', readKey: 'docs/comics/biographies/dhirubhai-ambani/01-the-polyester-dream/sources-and-quotes.read.md', downloadKey: 'docs/comics/biographies/dhirubhai-ambani/01-the-polyester-dream/sources-and-quotes.download.md', bytes: 3400 },
    ],
    bundleKey: 'docs/comics/biographies/dhirubhai-ambani/01-the-polyester-dream/bundle.md',
    bundleBytes: 5000,
    zipKey: 'docs/comics/biographies/dhirubhai-ambani/01-the-polyester-dream/docs.zip',
    zipBytes: 9000,
  },
}

beforeEach(() => {
  mockDownloadKey.mockReset()
  mockGated = () => ({ text: null, loading: false })
})

describe('DocumentsPanel', () => {
  test('renders nothing when the comic has no docs', () => {
    const { container } = render(<DocumentsPanel comic={baseComic} />)
    expect(container.firstChild).toBeNull()
  })

  test('renders the doc-pack, zip, individual files and the as-of date', () => {
    render(<DocumentsPanel comic={comicWithDocs} />)
    expect(screen.getByRole('button', { name: /download doc pack \(\.md\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\.zip/i })).toBeInTheDocument()
    // one row per item
    expect(screen.getByText('Concept note')).toBeInTheDocument()
    expect(screen.getByText('Sources & quotes')).toBeInTheDocument()
    // each item exposes a Read action
    expect(screen.getAllByRole('button', { name: /^read$/i })).toHaveLength(2)
    // as-of date
    expect(screen.getByText(/as of 2026-06-05/i)).toBeInTheDocument()
  })

  test('clicking the doc pack calls downloadKey with the bundle key and a friendly name', () => {
    render(<DocumentsPanel comic={comicWithDocs} />)
    fireEvent.click(screen.getByRole('button', { name: /download doc pack \(\.md\)/i }))
    expect(mockDownloadKey).toHaveBeenCalledWith(
      comicWithDocs.docs!.bundleKey,
      '01-the-polyester-dream-doc-pack.md',
    )
  })

  test('clicking the zip button calls downloadKey with the zip key and a friendly name', () => {
    render(<DocumentsPanel comic={comicWithDocs} />)
    fireEvent.click(screen.getByRole('button', { name: /\.zip/i }))
    expect(mockDownloadKey).toHaveBeenCalledWith(
      comicWithDocs.docs!.zipKey,
      '01-the-polyester-dream-docs.zip',
    )
  })

  test('clicking an item download calls downloadKey with that item key and a per-type name', () => {
    render(<DocumentsPanel comic={comicWithDocs} />)
    fireEvent.click(screen.getAllByRole('button', { name: /download file/i })[0])
    expect(mockDownloadKey).toHaveBeenCalledWith(
      comicWithDocs.docs!.items[0].downloadKey,
      '01-the-polyester-dream-concept-note.md',
    )
  })

  test('clicking Read reveals the gated doc text via the inline reader', () => {
    mockGated = () => ({ text: '# Concept\n\nThe pitch.', loading: false })
    render(<DocumentsPanel comic={comicWithDocs} />)
    // before Read, the reader text isn't shown
    expect(screen.queryByText(/the pitch/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /^read$/i })[0])
    expect(screen.getByText(/the pitch/i)).toBeInTheDocument()
  })
})

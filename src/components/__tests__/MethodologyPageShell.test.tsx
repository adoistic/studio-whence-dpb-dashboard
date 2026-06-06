import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { MethodologyDocs } from '@/lib/catalog'
import type { Async } from '@/lib/catalog'
import { MethodologyPageShell } from '../MethodologyPageShell'

let mockMethodology: () => Async<MethodologyDocs | null>
vi.mock('@/lib/catalog', () => ({
  useMethodology: () => mockMethodology(),
}))

let mockGated: () => { text: string | null; loading: boolean; error?: Error }
vi.mock('@/lib/useGatedText', () => ({ useGatedText: () => mockGated() }))

const mockDownloadKey = vi.fn()
vi.mock('@/lib/downloadDoc', () => ({
  downloadKey: (...a: unknown[]) => mockDownloadKey(...a),
}))

const methodology: MethodologyDocs = {
  readKey: 'docs/methodology/diamond-books.read.md',
  downloadKey: 'docs/methodology/diamond-books.download.md',
  bytes: 4200,
  generatedAt: '2026-06-04',
}

beforeEach(() => {
  mockDownloadKey.mockReset()
  mockMethodology = () => ({ data: methodology, loading: false })
  mockGated = () => ({ text: '## The pipeline\n\nHow we build the comics.', loading: false })
})

describe('MethodologyPageShell', () => {
  test('renders the fetched markdown, the as-of date and a download button', () => {
    render(<MethodologyPageShell />)
    expect(screen.getByRole('heading', { level: 1, name: /methodology/i })).toBeInTheDocument()
    expect(screen.getByText(/how we build the comics/i)).toBeInTheDocument()
    expect(screen.getByText(/as of 2026-06-04/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download \(\.md\)/i })).toBeInTheDocument()
  })

  test('the download button calls downloadKey with the methodology key and a friendly name', () => {
    render(<MethodologyPageShell />)
    fireEvent.click(screen.getByRole('button', { name: /download \(\.md\)/i }))
    expect(mockDownloadKey).toHaveBeenCalledWith(
      methodology.downloadKey,
      'diamond-books-methodology.md',
    )
  })

  test('renders a quiet empty state when methodology data is null', () => {
    mockMethodology = () => ({ data: null, loading: false })
    mockGated = () => ({ text: null, loading: false })
    render(<MethodologyPageShell />)
    expect(screen.queryByRole('button', { name: /download \(\.md\)/i })).not.toBeInTheDocument()
    expect(screen.getByText(/not available/i)).toBeInTheDocument()
  })
})

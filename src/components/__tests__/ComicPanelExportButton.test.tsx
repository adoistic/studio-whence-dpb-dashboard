import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Comic } from '@/types/content'

// Mock the gated dataApi so importing the component never initializes firebase.
const resolveUrls = vi.fn()
vi.mock('@/lib/dataApi', () => ({ resolveUrls: (keys: string[]) => resolveUrls(keys) }))

import { ComicPanelExportButton } from '@/components/ComicPanelExportButton'

const baseComic: Comic = {
  title: 'LEGO — The System That Nearly Forgot Itself',
  line: 'biographies',
  status: 'draft',
  slug: '01-the-system-that-nearly-forgot-itself',
  subject_slug: 'lego',
}

const DOCX = 'artifacts/comics/biographies/01-the-system-that-nearly-forgot-itself/script-exports/01-the-system-that-nearly-forgot-itself-panels.docx'
const PDF = 'artifacts/comics/biographies/01-the-system-that-nearly-forgot-itself/script-exports/01-the-system-that-nearly-forgot-itself-panels.pdf'

const withExports: Comic = {
  ...baseComic,
  scriptExports: { layout: 'panel', docxKey: DOCX, pdfKey: PDF, pages: 48 },
}

function stubDownloadEnv() {
  const createObjectURL = vi.fn(() => 'blob:mock')
  const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
  return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
}

beforeEach(() => {
  resolveUrls.mockReset()
})

describe('ComicPanelExportButton', () => {
  // Activity books and storybooks have no panel grammar, so they never get a
  // published panel export — the control must simply not exist for them rather
  // than render a dead button.
  test('renders nothing when the comic has no panel export', () => {
    const { container } = render(<ComicPanelExportButton comic={baseComic} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('resolves the docxKey and downloads the Word file', async () => {
    resolveUrls.mockResolvedValue({ [DOCX]: 'https://r2.example/docx' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['docx-bytes']),
    })
    vi.stubGlobal('fetch', fetchMock)
    stubDownloadEnv()

    render(<ComicPanelExportButton comic={withExports} />)
    fireEvent.click(screen.getByRole('button', { name: /word/i }))

    await waitFor(() => expect(resolveUrls).toHaveBeenCalledWith([DOCX]))
    expect(fetchMock).toHaveBeenCalledWith('https://r2.example/docx')
  })

  // The two buttons must resolve DIFFERENT keys. A single shared key would be
  // the easy regression here, and it would silently hand a reviewer the wrong
  // file format without erroring.
  test('resolves the pdfKey — not the docxKey — for the PDF button', async () => {
    resolveUrls.mockResolvedValue({ [PDF]: 'https://r2.example/pdf' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['pdf-bytes'], { type: 'application/pdf' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    stubDownloadEnv()

    render(<ComicPanelExportButton comic={withExports} />)
    fireEvent.click(screen.getByRole('button', { name: /^pdf$/i }))

    await waitFor(() => expect(resolveUrls).toHaveBeenCalledWith([PDF]))
    expect(resolveUrls).not.toHaveBeenCalledWith([DOCX])
  })

  test('surfaces an error instead of failing silently', async () => {
    resolveUrls.mockResolvedValue({})  // gate returned no presigned url
    stubDownloadEnv()
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ComicPanelExportButton comic={withExports} />)
    fireEvent.click(screen.getByRole('button', { name: /^pdf$/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})

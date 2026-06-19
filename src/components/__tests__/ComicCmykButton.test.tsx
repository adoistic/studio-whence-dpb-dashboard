import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Comic } from '@/types/content'

// Mock the gated dataApi so importing the component never initializes firebase.
const resolveUrls = vi.fn()
vi.mock('@/lib/dataApi', () => ({ resolveUrls: (keys: string[]) => resolveUrls(keys) }))

import { ComicCmykButton } from '@/components/ComicCmykButton'

const baseComic: Comic = {
  title: 'My First Book of Numbers 1 to 20',
  line: 'toddlers',
  status: 'in-review',
  slug: 'numbers',
  subject_slug: null,
}

beforeEach(() => {
  resolveUrls.mockReset()
})

describe('ComicCmykButton', () => {
  test('renders nothing when the comic has no CMYK PDF', () => {
    const { container } = render(<ComicCmykButton comic={baseComic} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('resolves the cmykPdf key and downloads the PDF', async () => {
    const comic: Comic = {
      ...baseComic,
      cmykPdf: {
        key: 'artifacts/comics/toddlers/numbers/numbers-CMYK.pdf',
        bytes: 339000000,
        filename: 'numbers-CMYK-FOGRA52.pdf',
      },
    }
    resolveUrls.mockResolvedValue({
      'artifacts/comics/toddlers/numbers/numbers-CMYK.pdf': 'https://r2.example/presigned',
    })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['pdf-bytes'], { type: 'application/pdf' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<ComicCmykButton comic={comic} />)
    fireEvent.click(screen.getByRole('button', { name: /download cmyk/i }))

    await waitFor(() => {
      expect(resolveUrls).toHaveBeenCalledWith([
        'artifacts/comics/toddlers/numbers/numbers-CMYK.pdf',
      ])
    })
    expect(fetchMock).toHaveBeenCalledWith('https://r2.example/presigned')
    expect(clickSpy).toHaveBeenCalled()

    clickSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})

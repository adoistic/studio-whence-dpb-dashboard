import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Comic } from '@/types/content'

const resolveUrls = vi.fn()
vi.mock('@/lib/dataApi', () => ({ resolveUrls: (keys: string[]) => resolveUrls(keys) }))

import { ComicInDesignButton } from '@/components/ComicInDesignButton'

const baseComic: Comic = {
  title: 'Nole',
  line: 'biographies',
  status: 'published',
  slug: '01-nole',
  subject_slug: 'novak-djokovic',
}

beforeEach(() => {
  resolveUrls.mockReset()
})

describe('ComicInDesignButton', () => {
  test('renders nothing when the comic has no InDesign files', () => {
    const { container } = render(<ComicInDesignButton comic={baseComic} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('resolves the indesign key and downloads the zip under its filename', async () => {
    const key = 'artifacts/comics/biographies/01-nole/01-nole-indesign.zip'
    const comic: Comic = { ...baseComic, indesign: { key, bytes: 14000000, filename: '01-nole-InDesign.zip' } }
    resolveUrls.mockResolvedValue({ [key]: 'https://r2.example/presigned' })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['zip']) })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
    let downloaded = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download
    })

    render(<ComicInDesignButton comic={comic} />)
    fireEvent.click(screen.getByRole('button', { name: /download indesign/i }))

    await waitFor(() => expect(downloaded).toBe('01-nole-InDesign.zip'))
    expect(resolveUrls).toHaveBeenCalledWith([key])
    expect(fetchMock).toHaveBeenCalledWith('https://r2.example/presigned')
  })
})

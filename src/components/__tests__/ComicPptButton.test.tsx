import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Comic } from '@/types/content'

// Mock the gated dataApi so importing the component never initializes firebase.
const resolveUrls = vi.fn()
vi.mock('@/lib/dataApi', () => ({ resolveUrls: (keys: string[]) => resolveUrls(keys) }))

import { ComicPptButton } from '@/components/ComicPptButton'

const baseComic: Comic = {
  title: '201 Maths Activity Book',
  line: 'toddlers',
  status: 'in-review',
  slug: 'maths-201',
  subject_slug: null,
}

beforeEach(() => {
  resolveUrls.mockReset()
})

describe('ComicPptButton', () => {
  test('renders nothing when the comic has no editable PPT', () => {
    const { container } = render(<ComicPptButton comic={baseComic} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('resolves the editablePpt key and downloads the .pptx', async () => {
    const comic: Comic = {
      ...baseComic,
      editablePpt: {
        key: 'artifacts/comics/toddlers/maths-201/maths-201-editable.pptx',
        bytes: 3452420,
        filename: '201-Maths-EDITABLE.pptx',
      },
    }
    resolveUrls.mockResolvedValue({
      'artifacts/comics/toddlers/maths-201/maths-201-editable.pptx': 'https://r2.example/presigned',
    })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['pptx-bytes'], { type: 'application/octet-stream' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<ComicPptButton comic={comic} />)
    fireEvent.click(screen.getByRole('button', { name: /download as ppt/i }))

    await waitFor(() => {
      expect(resolveUrls).toHaveBeenCalledWith([
        'artifacts/comics/toddlers/maths-201/maths-201-editable.pptx',
      ])
    })
    expect(fetchMock).toHaveBeenCalledWith('https://r2.example/presigned')
    expect(clickSpy).toHaveBeenCalled()

    clickSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})

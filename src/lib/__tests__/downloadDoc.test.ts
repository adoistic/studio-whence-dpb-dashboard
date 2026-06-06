import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockResolveUrls = vi.fn()
vi.mock('@/lib/dataApi', () => ({ resolveUrls: (...a: unknown[]) => mockResolveUrls(...a) }))

import { downloadKey } from '@/lib/downloadDoc'

describe('downloadKey', () => {
  beforeEach(() => {
    mockResolveUrls.mockReset()
    vi.restoreAllMocks()
  })

  it('presigns the key, fetches the blob, and clicks a download anchor with the friendly name', async () => {
    const key = 'docs/comics/x/y/z/bundle.md'
    mockResolveUrls.mockResolvedValue({ [key]: 'https://signed.example/bundle.md' })

    const blob = new Blob(['hello'], { type: 'text/markdown' })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob })
    vi.stubGlobal('fetch', fetchMock)

    const createObjectURL = vi.fn().mockReturnValue('blob:obj-123')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL } as unknown as typeof URL)

    let clickedAnchor: HTMLAnchorElement | null = null
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag)
      if (tag === 'a') {
        clickedAnchor = el as HTMLAnchorElement
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {})
      }
      return el
    })

    await downloadKey(key, 'z-doc-pack.md')

    expect(mockResolveUrls).toHaveBeenCalledWith([key])
    expect(fetchMock).toHaveBeenCalledWith('https://signed.example/bundle.md')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clickedAnchor).not.toBeNull()
    expect(clickedAnchor!.download).toBe('z-doc-pack.md')
    expect(clickedAnchor!.href).toBe('blob:obj-123')
    expect((clickedAnchor!.click as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:obj-123')
  })

  it('throws when the key cannot be resolved', async () => {
    mockResolveUrls.mockResolvedValue({})
    await expect(downloadKey('docs/missing.md', 'x.md')).rejects.toThrow(/could not resolve/)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { routeImage, INLINE_THRESHOLD, safeFilename } from '@/lib/ideaImages'

function fakeFile(name: string, size: number, type = 'image/png'): File {
  const blob = new Blob([new Uint8Array(size)], { type })
  return new File([blob], name, { type })
}

describe('safeFilename', () => {
  it('strips path + unsafe chars', () => {
    expect(safeFilename('../a b/c!.png')).toBe('c_.png')
  })
})

describe('routeImage', () => {
  it('inlines a tiny image as a data URI', async () => {
    const toDataUri = vi.fn(async () => 'data:image/png;base64,AA')
    const out = await routeImage(fakeFile('x.png', INLINE_THRESHOLD - 1), {
      ideaId: 'i1', upload: vi.fn(), toDataUri,
    })
    expect(out.kind).toBe('inline')
    if (out.kind === 'inline') expect(out.dataUri).toBe('data:image/png;base64,AA')
  })
  it('uploads a large image to R2', async () => {
    const upload = vi.fn(async () => {})
    const out = await routeImage(fakeFile('big.png', INLINE_THRESHOLD + 1), {
      ideaId: 'i1', upload, toDataUri: vi.fn(),
    })
    expect(out.kind).toBe('r2')
    if (out.kind === 'r2') {
      expect(out.key).toBe('images/ideas/i1/big.png')
      expect(out.token).toBe('r2:images/ideas/i1/big.png')
      expect(upload).toHaveBeenCalledWith(expect.any(File), 'images/ideas/i1/big.png')
    }
  })
})

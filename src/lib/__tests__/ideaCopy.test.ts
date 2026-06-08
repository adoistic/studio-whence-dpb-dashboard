import { describe, it, expect, vi } from 'vitest'
import { buildClipboardPayload } from '@/lib/ideaCopy'

describe('buildClipboardPayload', () => {
  it('keeps markdown as the plain-text flavour', async () => {
    const out = await buildClipboardPayload('# Hi', async () => ({ dataUri: '', bytes: 0 }))
    expect(out.text).toBe('# Hi')
  })
  it('renders headings to html', async () => {
    const out = await buildClipboardPayload('# Hi', async () => ({ dataUri: '', bytes: 0 }))
    expect(out.html).toContain('<h1')
  })
  it('inlines r2: images as base64 data URIs', async () => {
    const resolve = vi.fn(async () => ({ dataUri: 'data:image/png;base64,ZZ', bytes: 2 }))
    const out = await buildClipboardPayload('![a](r2:images/ideas/x/p.png)', resolve)
    expect(resolve).toHaveBeenCalledWith('images/ideas/x/p.png')
    expect(out.html).toContain('src="data:image/png;base64,ZZ"')
  })
  it('leaves data: images inline untouched', async () => {
    const out = await buildClipboardPayload('![a](data:image/png;base64,QQ)', async () => ({ dataUri: '', bytes: 0 }))
    expect(out.html).toContain('data:image/png;base64,QQ')
  })
})

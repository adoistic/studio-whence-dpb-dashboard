import { describe, it, expect } from 'vitest'
import { fitImage, assembleDocx } from '@/lib/exportDocx'
import type { Block } from '@/lib/exportBlocks'
import type { ImageMap } from '@/lib/exportZip'

// Smallest valid JPEG (1×1), enough for docx to embed without decoding.
const JPG_1PX = Uint8Array.from(atob(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
), (c) => c.charCodeAt(0))

describe('fitImage', () => {
  it('scales down to the max width preserving aspect', () => {
    expect(fitImage({ width: 1200, height: 1800 }, 600)).toEqual({ width: 600, height: 900 })
  })
  it('never scales up', () => {
    expect(fitImage({ width: 300, height: 200 }, 600)).toEqual({ width: 300, height: 200 })
  })
})

describe('assembleDocx', () => {
  const blocks: Block[] = [
    { kind: 'title', text: 'Test Comic', sub: 'meta' },
    { kind: 'h1', text: 'PAGE 1' },
    { kind: 'image', ref: 1 },
    { kind: 'h2', text: 'COMMENTS' },
    { kind: 'line', runs: [{ text: 'No comments.', italics: true }] },
    { kind: 'row', left: [{ kind: 'image', ref: 1 }], right: [{ kind: 'line', runs: [{ text: 'x' }] }] },
  ]
  const images: ImageMap = new Map([[1, { bytes: JPG_1PX, width: 1, height: 1 }]])

  it('produces non-empty docx bytes (zip magic) for both layouts', async () => {
    for (const layout of ['portrait', 'landscape'] as const) {
      const bytes = await assembleDocx(blocks, images, layout)
      expect(bytes.length).toBeGreaterThan(500)
      expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]) // "PK"
    }
  })

  it('renders a placeholder line when an image ref is missing from the map', async () => {
    const bytes = await assembleDocx([{ kind: 'image', ref: 7 }], new Map(), 'portrait')
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
  })
})

import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ComicReader } from '@/components/ComicReader'
import { __clearResolvedCache } from '@/lib/useResolved'
import type { Comic } from '@/types/content'

vi.mock('@/lib/dataApi', () => ({
  resolveUrls: vi.fn(async (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, `https://fake/${k}`])),
  ),
}))

const comic: Comic = {
  title: 'X', line: 'biographies', status: 'approved', slug: '01-the-comic',
  subject_slug: 'fig',
  pages: { hasPages: true, count: 2, coverKey: 'images/comics/biographies/01-the-comic/cover.jpg' },
}

beforeEach(() => __clearResolvedCache())

describe('ComicReader', () => {
  test('shows a page counter reflecting cover + pages', async () => {
    render(<ComicReader comic={comic} />)
    // cover + 2 pages = 3 frames
    expect(await screen.findByText('1 / 3')).toBeInTheDocument()
  })

  test('next advances the counter', async () => {
    render(<ComicReader comic={comic} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }))
    expect(await screen.findByText('2 / 3')).toBeInTheDocument()
  })

  test('opens a fullscreen dialog and closes it', async () => {
    render(<ComicReader comic={comic} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Full screen' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /close full screen/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('paging inside the fullscreen dialog advances the page', async () => {
    render(<ComicReader comic={comic} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Full screen' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next page' }))
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument()
  })

  test('left swipe advances, right swipe goes back (touch)', async () => {
    render(<ComicReader comic={comic} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Full screen' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.touchStart(dialog, { touches: [{ clientX: 300, clientY: 100 }] })
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 120, clientY: 110 }] })
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument()
    fireEvent.touchStart(dialog, { touches: [{ clientX: 120, clientY: 100 }] })
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 300, clientY: 110 }] })
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument()
  })

  // ── Page-level comments (reader → drawer) ────────────────────────────────
  test('hides the comment button on the cover frame, shows it on pages, cover-aware numbering', async () => {
    const onCommentPage = vi.fn()
    render(<ComicReader comic={comic} onCommentPage={onCommentPage} />)
    // Frame 1 of 3 = the cover → no comment affordance.
    await screen.findByText('1 / 3')
    expect(screen.queryByRole('button', { name: /comments on page/i })).not.toBeInTheDocument()
    // Advance to frame 2 = script page 1.
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    const btn = await screen.findByRole('button', { name: 'Comments on page 1' })
    fireEvent.click(btn)
    expect(onCommentPage).toHaveBeenCalledWith(1)
  })

  test('shows the per-page thread count and numbers pages without a cover from 1', async () => {
    const noCover: Comic = {
      ...comic,
      pages: { hasPages: true, count: 2, coverKey: null },
    }
    const onCommentPage = vi.fn()
    render(
      <ComicReader
        comic={noCover}
        onCommentPage={onCommentPage}
        pageCounts={new Map([[1, 3]])}
      />,
    )
    // Frame 1 of 2 = page 1 (no cover) with 3 threads.
    const btn = await screen.findByRole('button', { name: 'Comments on page 1' })
    expect(btn).toHaveTextContent('3 comments · page 1')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(await screen.findByRole('button', { name: 'Comments on page 2' })).toHaveTextContent(
      'Comment on page 2',
    )
  })

  test('fullscreen toolbar comment button closes the overlay and fires the callback', async () => {
    const onCommentPage = vi.fn()
    render(<ComicReader comic={comic} onCommentPage={onCommentPage} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Full screen' })[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Comments on page 1' }))
    expect(onCommentPage).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

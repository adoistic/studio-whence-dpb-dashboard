import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    expect(await screen.findByText('1 / 3')).toBeInTheDocument()
  })
  test('next advances the counter', async () => {
    render(<ComicReader comic={comic} />)
    fireEvent.click(await screen.findByRole('button', { name: /next/i }))
    expect(await screen.findByText('2 / 3')).toBeInTheDocument()
  })
})

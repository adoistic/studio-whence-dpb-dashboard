import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Comic } from '@/types/content'

vi.mock('@/lib/useResolved', () => ({
  useResolved: (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, `https://signed.example/${k}`])),
}))
vi.mock('@/lib/downloadDoc', () => ({ downloadKey: vi.fn() }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/dataApi', () => ({ uploadCoverRef: vi.fn() }))

// Record which coverChoices doc each language reads and writes.
const cc = vi.hoisted(() => ({ read: [] as string[], set: vi.fn() }))
vi.mock('@/lib/coverChoice', async (orig) => {
  const real = await orig<typeof import('@/lib/coverChoice')>()
  return {
    coverChoiceDocId: real.coverChoiceDocId,
    useCoverChoice: (id: string) => { cc.read.push(id); return { choice: null, loading: false } },
    setOptionAsOfficial: cc.set,
    uploadOfficialCover: vi.fn(),
  }
})

import { CoverOptions } from '@/components/CoverOptions'

const base = 'artifacts/comics/biographies/01-mdh/cover-options'
const comic = {
  line: 'biographies',
  slug: '01-mdh',
  title: 'MDH',
  originalLanguage: 'en',
  coverOptions: {
    language: 'English',
    options: [
      { key: `${base}/opt1.png`, label: 'Option 1' },
      { key: `${base}/opt2.png`, label: 'Option 2' },
      { key: `${base}/opt3.png`, label: 'Option 3', lang: 'hi' },
    ],
  },
} as Comic

const author = { email: 'm@dpb.in', name: 'M' }

describe('CoverOptions with a translated edition', () => {
  beforeEach(() => { cc.read = []; cc.set.mockClear() })

  test('shows the original language first, and only its options', () => {
    render(<CoverOptions comic={comic} />)
    expect(screen.getByRole('tab', { name: 'English' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByAltText(/Option 1/)).toBeInTheDocument()
    expect(screen.queryByAltText(/Option 3/)).toBeNull()
  })

  test('the Hindi pill shows the Hindi covers', () => {
    render(<CoverOptions comic={comic} />)
    fireEvent.click(screen.getByRole('tab', { name: 'हिंदी' }))
    expect(screen.getByAltText(/Option 3/)).toBeInTheDocument()
    expect(screen.queryByAltText(/Option 1/)).toBeNull()
  })

  test('a Hindi pick is saved to its own doc, never over the English cover', () => {
    render(<CoverOptions comic={comic} canModerate author={author} />)
    fireEvent.click(screen.getByRole('tab', { name: 'हिंदी' }))
    fireEvent.click(screen.getByRole('button', { name: /set official/i }))
    expect(cc.set).toHaveBeenCalledWith('biographies__01-mdh__hi', expect.objectContaining({ label: 'Option 3' }), author)
  })

  test('an English pick keeps the bare comic id, so existing choices still apply', () => {
    render(<CoverOptions comic={comic} canModerate author={author} />)
    fireEvent.click(screen.getAllByRole('button', { name: /set official/i })[0])
    expect(cc.set).toHaveBeenCalledWith('biographies__01-mdh', expect.objectContaining({ label: 'Option 1' }), author)
  })

  test('a single-language book shows no pills', () => {
    const one = { ...comic, coverOptions: { language: 'English', options: comic.coverOptions!.options.slice(0, 2) } } as Comic
    render(<CoverOptions comic={one} />)
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})

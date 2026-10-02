import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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

  test('shows every edition at once, each in its own marked section, original first', () => {
    render(<CoverOptions comic={comic} />)
    const regions = screen.getAllByRole('region')
    expect(regions.map((r) => r.getAttribute('aria-label'))).toEqual(['English edition covers', 'Hindi edition covers'])
    expect(within(regions[0]).getByAltText(/Option 1/)).toBeInTheDocument()
    expect(within(regions[0]).queryByAltText(/Option 3/)).toBeNull()
    expect(within(regions[1]).getByAltText(/Option 3/)).toBeInTheDocument()
    expect(within(regions[1]).queryByAltText(/Option 1/)).toBeNull()
  })

  test('each edition reads its own choice doc', () => {
    render(<CoverOptions comic={comic} />)
    expect(cc.read).toEqual(expect.arrayContaining(['biographies__01-mdh', 'biographies__01-mdh__hi']))
  })

  test('a Hindi pick is saved to its own doc, never over the English cover', () => {
    render(<CoverOptions comic={comic} canModerate author={author} />)
    const hindi = screen.getByRole('region', { name: 'Hindi edition covers' })
    fireEvent.click(within(hindi).getByRole('button', { name: /set official/i }))
    expect(cc.set).toHaveBeenCalledWith('biographies__01-mdh__hi', expect.objectContaining({ label: 'Option 3' }), author)
  })

  test('an English pick keeps the bare comic id, so existing choices still apply', () => {
    render(<CoverOptions comic={comic} canModerate author={author} />)
    const english = screen.getByRole('region', { name: 'English edition covers' })
    fireEvent.click(within(english).getAllByRole('button', { name: /set official/i })[0])
    expect(cc.set).toHaveBeenCalledWith('biographies__01-mdh', expect.objectContaining({ label: 'Option 1' }), author)
  })

  test('blank plates sit under their own heading, apart from the titled covers', () => {
    const withBlank = { ...comic, coverOptions: { language: 'English', options: [
      { key: `${base}/opt1.png`, label: 'Option 1' },
      { key: `${base}/opt1-clean.png`, label: 'Option 1 — clean plate (no titling)' },
    ] } } as Comic
    render(<CoverOptions comic={withBlank} />)
    const heading = screen.getByText(/Blank versions/)
    const blankBlock = heading.parentElement as HTMLElement
    expect(within(blankBlock).getByAltText(/clean plate/)).toBeInTheDocument()
    expect(within(blankBlock).queryByAltText(/Option 1$/)).toBeNull()
  })

  test('a single-language book shows no edition sections or jump links', () => {
    const one = { ...comic, coverOptions: { language: 'English', options: comic.coverOptions!.options.slice(0, 2) } } as Comic
    render(<CoverOptions comic={one} />)
    expect(screen.queryByRole('navigation', { name: 'Cover editions' })).toBeNull()
    expect(screen.queryByText(/Hindi edition/)).toBeNull()
  })
})

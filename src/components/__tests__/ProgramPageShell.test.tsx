/**
 * ProgramPageShell — Comics · Characters · Subjects.
 *
 * Pinned: the Characters tab exists on every programme (manga, comics, any line),
 * loads the casts of exactly the programme's books plus the line's cast library, and
 * nothing is read until the tab is opened.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Comic, Figure, Program } from '@/types/content'

const castCalls: string[][] = []
vi.mock('@/lib/casts', () => ({
  useCasts: (ids: string[]) => {
    castCalls.push(ids)
    return { data: [], loading: false }
  },
}))
vi.mock('@/components/ComicsTable', () => ({ ComicsTable: () => <div>comics-table</div> }))
vi.mock('@/components/PeopleTable', () => ({ PeopleTable: () => <div>people-table</div> }))
vi.mock('@/components/WorkCharacters', () => ({
  WorkCharacters: (p: { title: string; program?: string }) => <div>cast of {p.title} / {p.program}</div>,
}))

import { ProgramPageShell } from '@/components/ProgramPageShell'

const program: Program = { slug: 'manga-indic', line: 'manga-indic', title: 'Indic' }
const comics = [
  { line: 'manga-indic', slug: '01-volume-one', title: 'V1' },
  { line: 'manga-indic', slug: '02-volume-two', title: 'V2' },
] as Comic[]

beforeEach(() => { castCalls.length = 0 })

describe('ProgramPageShell', () => {
  test('offers Characters even when the programme has no research subjects', () => {
    render(<ProgramPageShell program={program} comics={comics} figures={[]} />)
    expect(screen.getByRole('tab', { name: 'Comics' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Characters' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Subjects' })).not.toBeInTheDocument()
  })

  test('reads nothing until Characters is opened, then exactly its books and the library', () => {
    render(<ProgramPageShell program={program} comics={comics} figures={[]} />)
    expect(castCalls.flat()).toEqual([])
    fireEvent.click(screen.getByRole('tab', { name: 'Characters' }))
    expect(castCalls.at(-1)).toEqual([
      'manga-indic__01-volume-one',
      'manga-indic__02-volume-two',
      'manga-indic__library',
    ])
    expect(screen.getByText('cast of Indic / manga-indic')).toBeInTheDocument()
  })

  test('the research subjects move to their own tab', () => {
    render(<ProgramPageShell program={program} comics={comics} figures={[{ slug: 'rama' } as Figure]} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Subjects' }))
    expect(screen.getByText('people-table')).toBeInTheDocument()
  })
})

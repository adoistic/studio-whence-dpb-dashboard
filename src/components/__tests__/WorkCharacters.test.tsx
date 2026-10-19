/**
 * WorkCharacters — the Characters tab on every work.
 *
 * Pinned: drawn, not drawn yet and generalised are all shown; one sheet downloads
 * under a human name; a tick selects, a character tick selects all its sheets, and
 * the bar zips exactly the selection; "Download all" zips every drawn sheet; the zip
 * is laid out one folder per character with a README that lists the whole cast.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { CastDoc } from '@/lib/castModel'
import { mergeCasts } from '@/lib/castModel'

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, googleProvider: {} }))
vi.mock('@/lib/dataApi', () => ({ resolveUrls: async () => ({}) }))
vi.mock('@/lib/useResolved', () => ({
  useResolved: (keys: string[]) => Object.fromEntries(keys.map((k) => [k, `https://r2.test/${k}`])),
  refreshResolved: () => {},
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
const downloadKey = vi.fn(async () => {})
const downloadZip = vi.fn(async () => ({ failed: [], cancelled: false, streamedToDisk: false }))
vi.mock('@/lib/downloads', async (orig) => ({
  ...(await orig<typeof import('@/lib/downloads')>()),
  downloadKey: (...a: unknown[]) => downloadKey(...(a as [])),
  downloadZip: (...a: unknown[]) => downloadZip(...(a as [])),
}))

import { WorkCharacters, castReadme, pageRanges, zipItemsFor } from '@/components/WorkCharacters'

const sheet = (id: string, stage: string, label: string, pages: number[], bytes = 2_000_000) => ({
  stage, label, drawn: true, pages, bytes,
  key: `artifacts/characters/indic/${id}/${stage}.png`, thumb: `artifacts/characters/indic/${id}/web/${stage}.jpg`,
})

const CAST: CastDoc = {
  comicId: 'indic__01-man', line: 'indic', slug: '01-man', title: 'Book One',
  subject_slug: 'ram', program_slug: 'ramayana', library: false, source: 'indic-cast',
  counts: { characters: 3, named: 2, generalized: 1, shared: 0, drawn: 1, undrawn: 1, versions: 4, versionsDrawn: 2 },
  people: [
    { id: 'rama', line: 'indic', name: 'Rama', kind: 'named', role: 'The hero of all seven books.', spoken: 67, pages: [3, 4, 5, 9],
      versions: [sheet('rama', 'rama-boy', 'Boy', [3, 4, 5]), sheet('rama', 'rama', 'Main look', [9]),
        { stage: 'rama-war', label: 'War', drawn: false, pages: [33] }] },
    { id: 'urmila', line: 'indic', name: 'Urmila', kind: 'named', pages: [5],
      versions: [{ stage: 'urmila', label: 'Main look', drawn: false, pages: [5] }] },
    { id: 'stock-sage', line: 'indic', name: 'Stock sage', kind: 'generalized', pages: [25],
      versions: [{ stage: 'sage', label: 'Sage', drawn: false, text: true, pages: [25] }] },
  ],
}

beforeEach(() => {
  downloadKey.mockClear()
  downloadZip.mockClear()
})

function setup() {
  render(<WorkCharacters casts={[CAST]} title="Rāmāyaṇa" />)
}

describe('WorkCharacters', () => {
  test('shows the drawn, the not-yet-drawn and the generalised, with honest totals', () => {
    setup()
    expect(screen.getByText(/3 characters · 2 of 5 versions drawn/)).toBeInTheDocument()
    expect(screen.getByText(/2 not drawn yet/)).toBeInTheDocument()
    const urmila = screen.getByRole('article', { name: 'Urmila' })
    expect(within(urmila).getByText('Not drawn yet')).toBeInTheDocument()
    const sage = screen.getByRole('article', { name: 'Stock sage' })
    expect(within(sage).getByText('Generalised')).toBeInTheDocument()
    expect(within(sage).getByText('Described in the page text')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Rama — Boy' })).toHaveAttribute('src', 'https://r2.test/artifacts/characters/indic/rama/web/rama-boy.jpg')
  })

  test('one sheet downloads under a human name', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Download Rama — Boy' }))
    expect(downloadKey).toHaveBeenCalledWith('artifacts/characters/indic/rama/rama-boy.png', 'Rama — Boy.png')
  })

  test('ticking sheets shows the bar, and the bar zips exactly the selection', () => {
    setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Rama — Boy' }))
    expect(screen.getByText(/1 sheet selected · 2.0 MB/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /download \.zip/i }))
    expect(downloadZip).toHaveBeenCalledTimes(1)
    const [name, items] = downloadZip.mock.calls[0] as unknown as [string, { path: string; key: string }[]]
    expect(name).toBe('Rāmāyaṇa — 1 character sheets.zip')
    expect(items).toEqual([{ path: 'Rāmāyaṇa — characters/Rama/Rama — Boy.png', key: 'artifacts/characters/indic/rama/rama-boy.png', bytes: 2_000_000 }])
  })

  test('a character tick selects every drawn sheet of theirs; Clear empties it', () => {
    setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select every drawn version of Rama' }))
    expect(screen.getByText(/2 sheets selected/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  test('Download all zips every drawn sheet', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /download all · 2 sheets/i }))
    const [name, items] = downloadZip.mock.calls[0] as unknown as [string, { path: string }[]]
    expect(name).toBe('Rāmāyaṇa — characters.zip')
    expect(items.map((i) => i.path)).toEqual([
      'Rāmāyaṇa — characters/Rama/Rama — Boy.png',
      'Rāmāyaṇa — characters/Rama/Rama — Main look.png',
    ])
  })

  test('the filters narrow the list', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /generalised/i }))
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Stock sage'])
    fireEvent.click(screen.getByRole('button', { name: /not drawn yet/i }))
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Rama', 'Urmila'])
  })

  test('select all shown takes every drawn sheet in view', () => {
    setup()
    fireEvent.click(screen.getByRole('checkbox', { name: /select all shown/i }))
    expect(screen.getByText(/2 sheets selected · 4.0 MB/)).toBeInTheDocument()
  })

  test('a selection survives the parent re-rendering with a new array, and resets for a new work', () => {
    const { rerender } = render(<WorkCharacters casts={[CAST]} title="Rāmāyaṇa" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Rama — Boy' }))
    rerender(<WorkCharacters casts={[{ ...CAST }]} title="Rāmāyaṇa" />)
    expect(screen.getByText(/1 sheet selected/)).toBeInTheDocument()
    rerender(<WorkCharacters casts={[{ ...CAST, comicId: 'indic__other', slug: 'other' }]} title="Other" />)
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  test('an empty work says so', () => {
    render(<WorkCharacters casts={[]} title="X" />)
    expect(screen.getByText('No cast has been published for these books yet.')).toBeInTheDocument()
  })
})

describe('the zip', () => {
  test('one folder per character, unique names, and a README naming the whole cast', () => {
    const all = mergeCasts([CAST])
    const picked = all[0].versions.filter((v) => v.drawn).map((version) => ({ character: all[0], version }))
    const { root, items, paths } = zipItemsFor('Rāmāyaṇa', picked)
    expect(root).toBe('Rāmāyaṇa — characters')
    expect(items).toHaveLength(2)
    const readme = castReadme('Rāmāyaṇa', all, paths, [], root)
    expect(readme).toContain('# Rāmāyaṇa — characters')
    expect(readme).toContain('## Rama — named · 4 pages · 67 lines')
    expect(readme).toContain('- War — NOT DRAWN YET')
    expect(readme).toContain('`Rama/Rama — Boy.png`')
    expect(readme).toContain('## Stock sage — generalised')
    expect(readme).toContain('described in the page text')
  })

  test('page lists collapse into ranges', () => {
    expect(pageRanges([3, 4, 5, 9, 12, 13])).toBe('3–5, 9, 12–13')
    expect(pageRanges([1, 3, 5, 7], 2)).toBe('1, 3 +2 more')
  })
})

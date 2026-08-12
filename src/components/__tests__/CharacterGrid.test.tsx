/**
 * Tests for src/components/CharacterGrid.tsx — ONE comic's cast.
 *
 * The repo-wide roster lives at /characters; this is the per-comic tab. The
 * behaviour worth pinning is the same in both places and is the reason either
 * exists: a version the book needs and nobody has drawn yet renders as a
 * labelled PLACEHOLDER. A cast sheet that quietly drops what is missing reads
 * as complete, which is the opposite of what an editor opens it for.
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { Comic } from '@/types/content'
import { CharacterGrid } from '../CharacterGrid'

// Keys resolve to presigned URLs through the gated channel; stub the resolver
// so a "drawn" version can be shown as resolved or as still-resolving.
let mockUrls: Record<string, string> = {}
vi.mock('@/lib/useResolved', () => ({ useResolved: () => mockUrls }))

const RAM_KEY = 'artifacts/characters/indic/ram/prince.png'

function comic(overrides: Partial<Comic> = {}): Comic {
  return {
    title: 'Ramayana',
    line: 'indic',
    slug: '01-ramayana',
    subject_slug: 'ramayana',
    status: 'draft',
    characters: {
      count: 2,
      drawn: 1,
      owed: 2,
      people: [
        {
          slug: 'ram', name: 'Ram', tag: 'RAM', tier: 'LEAD', lines: 42,
          pages: [1, 2, 3], desc: 'The prince of Ayodhya.',
          versions: [
            { stage: 'prince', pages: [1, 2], key: RAM_KEY, drawn: true },
            { stage: 'exile', pages: [30, 31], key: null, drawn: false },
          ],
        },
        {
          slug: 'sita', name: 'Sita', tag: 'SITA', tier: 'A', lines: 18,
          pages: [4], desc: null,
          versions: [{ stage: '—', pages: [4], key: null, drawn: false }],
        },
      ],
    },
    ...overrides,
  } as Comic
}

describe('CharacterGrid — placeholders', () => {
  test('an undrawn version renders a labelled placeholder, never an empty slot', () => {
    mockUrls = { [RAM_KEY]: 'https://r2.example/presigned' }
    render(<CharacterGrid comic={comic()} />)

    // Ram's exile version + Sita's only version.
    expect(screen.getAllByText('Not drawn yet')).toHaveLength(2)
    expect(screen.getAllByText('placeholder')).toHaveLength(2)
  })

  test('a character with no art at all is still listed, with their stage named', () => {
    mockUrls = {}
    render(<CharacterGrid comic={comic()} />)
    const sita = screen.getByRole('heading', { name: 'Sita' }).closest('article')!
    expect(within(sita).getByText('Not drawn yet')).toBeInTheDocument()
    // '—' is the published "nothing yet" stage; it reads as words, not a dash.
    expect(within(sita).getByText('no version yet')).toBeInTheDocument()
  })

  test('a drawn version renders the resolved image and a PNG download', () => {
    mockUrls = { [RAM_KEY]: 'https://r2.example/presigned' }
    render(<CharacterGrid comic={comic()} />)
    const img = screen.getByAltText('Ram — prince')
    expect(img).toHaveAttribute('src', 'https://r2.example/presigned')
    expect(screen.getByRole('link', { name: 'PNG' })).toHaveAttribute('download', 'ram--prince.png')
  })

  test('a drawn version whose key has not resolved yet says so — it is not a placeholder', () => {
    // The distinction matters: "loading…" is a network state, "Not drawn yet"
    // is a production fact. Conflating them would overstate what is missing.
    mockUrls = {}
    render(<CharacterGrid comic={comic()} />)
    expect(screen.getByText('loading…')).toBeInTheDocument()
    expect(screen.getAllByText('Not drawn yet')).toHaveLength(2)
  })
})

describe('CharacterGrid — the header', () => {
  test('states how much is drawn and how much is still owed', () => {
    mockUrls = {}
    render(<CharacterGrid comic={comic()} />)
    expect(screen.getByText(/2 characters · 1 versions drawn/)).toBeInTheDocument()
    expect(screen.getByText(/2 still to draw/)).toBeInTheDocument()
  })

  test('renders nothing at all when the comic has no published cast', () => {
    mockUrls = {}
    const { container } = render(<CharacterGrid comic={comic({ characters: undefined })} />)
    expect(container).toBeEmptyDOMElement()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IdeaMarkdown } from '@/components/ideas/IdeaMarkdown'

vi.mock('@/lib/useResolved', () => ({
  useResolved: (keys: string[]) => Object.fromEntries(keys.map((k) => [k, `https://signed/${k}`])),
}))

describe('IdeaMarkdown', () => {
  it('renders headings and gfm tables', () => {
    render(<IdeaMarkdown markdown={'# Hi\n\n| A | B |\n|---|---|\n| 1 | 2 |'} />)
    expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
  it('resolves an r2: image to a presigned url', () => {
    render(<IdeaMarkdown markdown={'![shot](r2:images/ideas/x/p.png)'} />)
    expect(screen.getByAltText('shot')).toHaveAttribute('src', 'https://signed/images/ideas/x/p.png')
  })
  it('renders a data: image inline', () => {
    render(<IdeaMarkdown markdown={'![tiny](data:image/png;base64,AA)'} />)
    expect(screen.getByAltText('tiny')).toHaveAttribute('src', 'data:image/png;base64,AA')
  })
})

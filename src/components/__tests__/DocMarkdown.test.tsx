import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DocMarkdown } from '@/components/DocMarkdown'

describe('DocMarkdown', () => {
  it('renders markdown headings and lists', () => {
    render(<DocMarkdown text={'# Hi\n\n- a\n- b'} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hi')
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['a', 'b'])
  })
})

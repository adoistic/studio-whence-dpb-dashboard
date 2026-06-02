import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProvenanceTooltip, type TooltipState } from '@/components/ProvenanceTooltip'

const base: TooltipState = {
  rect: { top: 300, bottom: 312, left: 100, right: 110, width: 10, height: 12 } as DOMRect,
  refnum: 15,
  line: 83,
  citation: { sourceTitle: 'Walter Isaacson, Steve Jobs', fileTitle: 'Chapter 12' },
  fallbackLabel: '18',
  excerpt: { status: 'loading' },
}

describe('ProvenanceTooltip', () => {
  it('shows the citation with source + file + line', () => {
    const { container } = render(<ProvenanceTooltip {...base} />)
    expect(screen.getByText(/Walter Isaacson, Steve Jobs/)).toBeInTheDocument()
    expect(screen.getByText(/Chapter 12/)).toBeInTheDocument()
    expect(screen.getByText(/line 83/)).toBeInTheDocument()
    // Decorative card: aria-hidden (info lives on the marker), so assert by class, not role.
    expect(container.querySelector('.prov-tip')).toBeInTheDocument()
  })
  it('shows loading then ready excerpt with the cited line emphasized', () => {
    const { rerender } = render(<ProvenanceTooltip {...base} />)
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
    rerender(<ProvenanceTooltip {...base} excerpt={{ status: 'ready', lines: ['ctx a', 'CITED', 'ctx b'], citedIndex: 1 }} />)
    const cited = screen.getByText('CITED')
    expect(cited.className).toMatch(/prov-tip-cited/)
  })
  it('falls back to fallbackLabel when citation is null', () => {
    render(<ProvenanceTooltip {...base} citation={null} />)
    expect(screen.getByText(/18, line 83/)).toBeInTheDocument()
  })
  it('shows an error state', () => {
    render(<ProvenanceTooltip {...base} excerpt={{ status: 'error' }} />)
    expect(screen.getByText(/Couldn.t load excerpt/i)).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { useProvenanceMarkers } from '@/lib/useProvenanceMarkers'
import { ProvenanceTooltip } from '@/components/ProvenanceTooltip'

let mockRead: (key: string) => Promise<string>
vi.mock('@/lib/dataApi', () => ({ readMarkdown: (k: string) => mockRead(k) }))

const content = {
  lines: [{ figures: [{ slug: 'steve-jobs', sources: [
    { slug: 'isaacson', title: 'Walter Isaacson, Steve Jobs', kind: 'book',
      files: [{ path: 'P/18.md', title: 'Chapter 12' }] },
  ] }] }],
} as any

const DRAFT =
  '<section class="cs-page"><div class="cs-panel">' +
  '<p class="cs-art">Art. <a class="cs-src-art" href="#" data-figure="steve-jobs" data-key="P/18.md" data-line="2" aria-label="source: 18, line 2">ref</a></p>' +
  '<p class="cs-caption"><a class="cs-src" href="#" data-figure="steve-jobs" data-key="P/18.md" data-line="2" aria-label="source: 18, line 2">source</a></p>' +
  '</div></section>'

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  const tip = useProvenanceMarkers(ref, content, DRAFT)
  return (
    <div>
      <div ref={ref} className="comic-script" dangerouslySetInnerHTML={{ __html: DRAFT }} />
      {tip && <ProvenanceTooltip {...tip} />}
    </div>
  )
}

beforeEach(() => { mockRead = vi.fn(async () => 'l1\nl2 cited\nl3') })

describe('useProvenanceMarkers', () => {
  it('numbers the markers 1..n in document order', () => {
    const { container } = render(<Harness />)
    const marks = container.querySelectorAll('.cs-src, .cs-src-art')
    expect(marks[0].textContent).toBe('1')
    expect(marks[1].textContent).toBe('2')
    expect(marks[0].getAttribute('data-refnum')).toBe('1')
  })

  it('aria-label numbering is idempotent (no stacked prefixes) on re-render', () => {
    const { container, rerender } = render(<Harness />)
    rerender(<Harness />)
    const m = container.querySelector('.cs-src-art')!
    const label = m.getAttribute('aria-label')!
    expect(label.match(/reference \d+:/g)?.length).toBe(1)
  })

  it('hover shows citation immediately then the fetched excerpt; refetch deduped', async () => {
    const { container } = render(<Harness />)
    const m = container.querySelector('.cs-src')!
    fireEvent.mouseOver(m)
    expect(screen.getByText(/Walter Isaacson, Steve Jobs/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('l2 cited')).toBeInTheDocument())
    fireEvent.mouseOut(m)
    fireEvent.mouseOver(container.querySelector('.cs-src-art')!)
    await waitFor(() => expect(screen.getByText('l2 cited')).toBeInTheDocument())
    expect(mockRead).toHaveBeenCalledTimes(1)
    // guard the load-bearing key contract: data-key is the bare repo path, fetched under research/
    expect(mockRead).toHaveBeenCalledWith('research/P/18.md')
  })

  it('hides the tooltip on mouseout', () => {
    const { container } = render(<Harness />)
    const m = container.querySelector('.cs-src')!
    fireEvent.mouseOver(m)
    expect(container.querySelector('.prov-tip')).toBeInTheDocument()
    fireEvent.mouseOut(m)
    expect(container.querySelector('.prov-tip')).not.toBeInTheDocument()
  })
})

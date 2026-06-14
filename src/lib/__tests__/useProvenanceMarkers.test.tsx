import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { useProvenanceMarkers, readKeyFor } from '@/lib/useProvenanceMarkers'
import { ProvenanceTooltip } from '@/components/ProvenanceTooltip'

let mockRead: (key: string) => Promise<string>
vi.mock('@/lib/dataApi', () => ({ readMarkdown: (k: string) => mockRead(k) }))

const citationMap = new Map([
  ['P/18.md', { sourceTitle: 'Walter Isaacson, Steve Jobs', fileTitle: 'Chapter 12' }],
])

const DRAFT =
  '<section class="cs-page"><div class="cs-panel">' +
  '<p class="cs-art">Art. <a class="cs-src-art" href="#" data-figure="steve-jobs" data-key="P/18.md" data-line="2" aria-label="source: 18, line 2">ref</a></p>' +
  '<p class="cs-caption"><a class="cs-src" href="#" data-figure="steve-jobs" data-key="P/18.md" data-line="2" aria-label="source: 18, line 2">source</a></p>' +
  '</div></section>'

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  const tip = useProvenanceMarkers(ref, citationMap, DRAFT)
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

  it('reads a served docs/research medicomics key as-is, not under research/', () => {
    mockRead = vi.fn(async () => 'l1\nl2 cited\nl3')
    const key = 'docs/research/medicomics/lung-cancer/_clinical/guidelines.md'
    const SERVED_DRAFT =
      '<section class="cs-page"><div class="cs-panel">' +
      `<p class="cs-caption"><a class="cs-src" href="#" data-figure="lung-cancer" data-key="${key}" data-line="2" aria-label="source: g, line 2">source</a></p>` +
      '</div></section>'
    function ServedHarness() {
      const ref = useRef<HTMLDivElement>(null)
      const tip = useProvenanceMarkers(ref, new Map(), SERVED_DRAFT)
      return (
        <div>
          <div ref={ref} className="comic-script" dangerouslySetInnerHTML={{ __html: SERVED_DRAFT }} />
          {tip && <ProvenanceTooltip {...tip} />}
        </div>
      )
    }
    const { container } = render(<ServedHarness />)
    fireEvent.mouseOver(container.querySelector('.cs-src')!)
    expect(mockRead).toHaveBeenCalledWith(key)
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

describe('readKeyFor', () => {
  it('reads a served docs/research key as-is (medicomics)', () => {
    expect(readKeyFor('docs/research/medicomics/lung-cancer/_clinical/guidelines.md')).toBe(
      'docs/research/medicomics/lung-cancer/_clinical/guidelines.md',
    )
  })

  it('reads other served prefixes as-is', () => {
    expect(readKeyFor('research/x.md')).toBe('research/x.md')
    expect(readKeyFor('artifacts/y.md')).toBe('artifacts/y.md')
  })

  it('prefixes a bare biographies repo path with research/', () => {
    expect(readKeyFor('biographies/04-Science-Legends/_books/x/y.md')).toBe(
      'research/biographies/04-Science-Legends/_books/x/y.md',
    )
    expect(readKeyFor('P/18.md')).toBe('research/P/18.md')
  })
})

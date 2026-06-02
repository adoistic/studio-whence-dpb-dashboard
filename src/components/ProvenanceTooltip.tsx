'use client'

export type ExcerptState =
  | { status: 'loading' }
  | { status: 'ready'; lines: string[]; citedIndex: number }
  | { status: 'error' }

export interface TooltipState {
  rect: DOMRect
  refnum: number
  line: number
  citation: { sourceTitle: string; fileTitle: string } | null
  fallbackLabel: string
  excerpt: ExcerptState
}

const WIDTH = 340

export function ProvenanceTooltip({ rect, line, citation, fallbackLabel, excerpt }: TooltipState) {
  const placeAbove = rect.top > 180 // ~approx tooltip height; keep in sync with .prov-tip in globals.css
  const top = placeAbove ? rect.top - 8 : rect.bottom + 8
  const left = Math.min(
    Math.max(8, rect.left),
    (typeof window !== 'undefined' ? window.innerWidth : WIDTH + 16) - WIDTH - 8,
  )
  const cite = citation
    ? `${citation.sourceTitle} — ${citation.fileTitle}, line ${line}`
    : `${fallbackLabel}, line ${line}`
  return (
    <div
      // Decorative hover/focus preview: the citation it shows duplicates the
      // marker's aria-label and the source is reachable via the marker's link,
      // so the card is hidden from the a11y tree rather than given role=tooltip.
      aria-hidden
      className="prov-tip"
      style={{ position: 'fixed', top, left, width: WIDTH, transform: placeAbove ? 'translateY(-100%)' : 'none' }}
    >
      <div className="prov-tip-cite">{cite}</div>
      <div className="prov-tip-excerpt">
        {excerpt.status === 'loading' && <span className="prov-tip-muted">Loading…</span>}
        {excerpt.status === 'error' && <span className="prov-tip-muted">Couldn’t load excerpt.</span>}
        {excerpt.status === 'ready' &&
          excerpt.lines.map((ln, i) => (
            <div key={i} className={i === excerpt.citedIndex ? 'prov-tip-cited' : 'prov-tip-ctx'}>
              {ln || ' '}
            </div>
          ))}
      </div>
    </div>
  )
}

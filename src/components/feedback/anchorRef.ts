// Pure helpers for parsing/indexing unit refs in the rendered comic draft.
// A "unit" is anything selectable for comment: a whole page, a whole panel,
// or a single beat (caption/dialogue/SFX/Art).
//
// Ref grammar (emitted by the content pipeline):
//   page  → "p13"
//   panel → "p13.pl1"
//   beat  → "p13.pl1.b2"  ·  Art beat → "p13.pl1.art"
import type { Anchor, AnchorKind } from '@/lib/feedbackTypes'

export interface ParsedRef {
  kind: AnchorKind
  page: number
  panel?: number
}

/**
 * Parse a unit ref into its kind/page/panel. Returns null for a malformed ref.
 * - "p13"          → { kind:'page',  page:13 }
 * - "p13.pl1"      → { kind:'panel', page:13, panel:1 }
 * - "p13.pl1.b2"   → { kind:'beat',  page:13, panel:1 }
 * - "p13.pl1.art"  → { kind:'beat',  page:13, panel:1 }
 */
export function parseAnchorRef(ref: string): ParsedRef | null {
  const page = /^p(\d+)$/.exec(ref)
  if (page) return { kind: 'page', page: parseInt(page[1], 10) }

  const panel = /^p(\d+)\.pl(\d+)$/.exec(ref)
  if (panel) return { kind: 'panel', page: parseInt(panel[1], 10), panel: parseInt(panel[2], 10) }

  const beat = /^p(\d+)\.pl(\d+)\.(?:b\d+|art)$/.exec(ref)
  if (beat) return { kind: 'beat', page: parseInt(beat[1], 10), panel: parseInt(beat[2], 10) }

  return null
}

/**
 * Index every selectable unit in the rendered draft by its ref:
 * pages ([data-page-ref]), panels ([data-panel-ref]) and beats ([data-beat-ref]).
 * Keyed by the attribute value.
 */
export function indexUnits(el: HTMLElement): Map<string, HTMLElement> {
  const m = new Map<string, HTMLElement>()
  for (const attr of ['data-page-ref', 'data-panel-ref', 'data-beat-ref'] as const) {
    el.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((node) => {
      const ref = node.getAttribute(attr)
      if (ref && !m.has(ref)) m.set(ref, node)
    })
  }
  return m
}

const SNAPSHOT_MAX = 140

// A beat's visible text, excluding any controls useCommentTargets injects into
// it (the numbered badge + the select toggle), so neither leaks into the
// snapshot regardless of injection order.
function beatText(el: HTMLElement): string {
  const injected = el.querySelectorAll('.cs-beat-badge, .cs-unit-select')
  if (injected.length === 0) return el.textContent ?? ''
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.cs-beat-badge, .cs-unit-select').forEach((n) => n.remove())
  return clone.textContent ?? ''
}

/** Trim + collapse whitespace and cap length for a stored anchor snapshot. */
function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > SNAPSHOT_MAX ? t.slice(0, SNAPSHOT_MAX - 1).trimEnd() + '…' : t
}

/**
 * Build an Anchor from a unit's ref + its DOM element. For a page the snapshot
 * is "Page N"; for a panel it is "Panel N" (or its first text line if present);
 * for a beat it is the beat's trimmed text. Returns null for a malformed ref.
 */
export function anchorFromUnit(ref: string, el: HTMLElement): Anchor | null {
  const parsed = parseAnchorRef(ref)
  if (!parsed) return null

  let snapshot: string
  if (parsed.kind === 'page') {
    snapshot = `Page ${parsed.page}`
  } else if (parsed.kind === 'panel') {
    snapshot = `Panel ${parsed.panel}`
  } else {
    snapshot = clip(beatText(el)) || `P${parsed.page}·${parsed.panel}`
  }

  return {
    kind: parsed.kind,
    ref,
    page: parsed.page,
    ...(parsed.panel !== undefined ? { panel: parsed.panel } : {}),
    snapshot,
  }
}

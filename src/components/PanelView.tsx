'use client'

/**
 * PanelView — render the gated panel model as an approximate comic page.
 *
 * This is a REHEARSAL of the page, not the finished art: panels are boxes on
 * a 12x16 grid, narration/dialogue render as plain boxes/balloons, and each
 * speaker is a small stick-figure silhouette instead of their drawn likeness.
 * The point is to let a script be reviewed as a comic page — panel count,
 * reading order, balloon crowding, who's on the page — before any art exists.
 *
 * This mirrors the visual grammar of the approved reference renderer,
 * `tools/panel_preview.py` (content pipeline repo), field for field: inside a
 * panel, narration → SFX → dialogue cascade → art brief. Every ref in the
 * model is stamped here as the exact same `data-*` attribute that renderer
 * emits — `data-page-ref` / `data-panel-ref` / `data-beat-ref` — because the
 * existing feedback system (`src/components/feedback/anchorRef.ts`) walks the
 * DOM for those attributes to anchor comments. Do not rename or drop them.
 *
 * Per spec §3.3, the page box is FIXED (a comic page has a fixed aspect
 * ratio) in every renderer, this one included — a panel never grows taller
 * than its grid row and never scrolls; an over-full box clips, exactly like
 * `tools/panel_preview.py`. An earlier version of this component let a
 * `.pv-panel` grow past its row's height (`overflow: visible; height: auto`)
 * on the theory that a scrolling web view didn't need to clip — but the grid
 * row itself did NOT grow to match, so the panel simply painted over the
 * panel(s) below it on the page. Silent clipping alone would still hide real
 * "this text is too long" information from a reviewer, so each panel body is
 * measured after render (scrollHeight vs clientHeight) and a panel whose
 * content didn't fit gets a small `OVERFLOWS` corner tag — see
 * `usePanelOverflow` below.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import type { ModelPage, ModelPanel, PanelBox, PanelModel } from '@/lib/panelModel'

// ---------------------------------------------------------------------------
// Stick figures — one inline SVG per silhouette type, ported 1:1 from
// panel_preview.py's _FIGURE_SVGS. Differentiated only by height and a single
// silhouette hint; a wrong silhouette is worse than a neutral one, so unknown
// keys fall back to "neutral".
// ---------------------------------------------------------------------------

const DEFAULT_FIGURE = 'neutral'

function FigureSvg({ kind }: { kind: string }) {
  switch (kind) {
    case 'adult':
      return (
        <svg viewBox="0 0 40 100" className="pv-figure-svg" aria-hidden="true">
          <circle cx={20} cy={14} r={10} />
          <line x1={20} y1={24} x2={20} y2={62} />
          <line x1={20} y1={34} x2={6} y2={52} />
          <line x1={20} y1={34} x2={34} y2={52} />
          <line x1={20} y1={62} x2={8} y2={96} />
          <line x1={20} y1={62} x2={32} y2={96} />
        </svg>
      )
    case 'man':
      return (
        <svg viewBox="0 0 40 100" className="pv-figure-svg" aria-hidden="true">
          <circle cx={20} cy={14} r={10} />
          <line x1={8} y1={26} x2={32} y2={26} />
          <line x1={20} y1={26} x2={20} y2={62} />
          <line x1={20} y1={32} x2={5} y2={52} />
          <line x1={20} y1={32} x2={35} y2={52} />
          <line x1={20} y1={62} x2={8} y2={96} />
          <line x1={20} y1={62} x2={32} y2={96} />
        </svg>
      )
    case 'woman':
      return (
        <svg viewBox="0 0 40 100" className="pv-figure-svg" aria-hidden="true">
          <circle cx={20} cy={14} r={10} />
          <line x1={20} y1={24} x2={20} y2={56} />
          <line x1={20} y1={32} x2={7} y2={50} />
          <line x1={20} y1={32} x2={33} y2={50} />
          <path d="M 11 56 L 20 56 L 29 56 L 34 92 L 6 92 Z" />
          <line x1={14} y1={92} x2={12} y2={98} />
          <line x1={26} y1={92} x2={28} y2={98} />
        </svg>
      )
    case 'boy':
      return (
        <svg viewBox="0 0 40 100" className="pv-figure-svg" aria-hidden="true">
          <circle cx={20} cy={30} r={9} />
          <line x1={20} y1={39} x2={20} y2={68} />
          <line x1={20} y1={46} x2={9} y2={60} />
          <line x1={20} y1={46} x2={31} y2={60} />
          <line x1={20} y1={68} x2={10} y2={94} />
          <line x1={20} y1={68} x2={30} y2={94} />
        </svg>
      )
    case 'girl':
      return (
        <svg viewBox="0 0 40 100" className="pv-figure-svg" aria-hidden="true">
          <circle cx={20} cy={30} r={9} />
          <line x1={20} y1={39} x2={20} y2={64} />
          <line x1={20} y1={45} x2={10} y2={58} />
          <line x1={20} y1={45} x2={30} y2={58} />
          <path d="M 13 64 L 20 64 L 27 64 L 31 90 L 9 90 Z" />
          <line x1={14} y1={90} x2={12} y2={96} />
          <line x1={26} y1={90} x2={28} y2={96} />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 40 100" className="pv-figure-svg" aria-hidden="true">
          <circle cx={20} cy={20} r={9} />
          <line x1={20} y1={29} x2={20} y2={60} />
          <line x1={20} y1={36} x2={8} y2={52} />
          <line x1={20} y1={36} x2={32} y2={52} />
          <line x1={20} y1={60} x2={9} y2={95} />
          <line x1={20} y1={60} x2={31} y2={95} />
        </svg>
      )
  }
}

// ---------------------------------------------------------------------------
// Box renderers
// ---------------------------------------------------------------------------

function upper(text: string | null | undefined): string {
  return (text ?? '').toUpperCase()
}

function CaptionBox({ box }: { box: PanelBox }) {
  return (
    <div className="pv-box pv-box-caption" data-beat-ref={box.ref}>
      {box.speaker && <span className="pv-caption-speaker">{upper(box.speaker)}</span>}
      {upper(box.text)}
    </div>
  )
}

function SfxBox({ box }: { box: PanelBox }) {
  return (
    <div className="pv-sfx-box" data-beat-ref={box.ref}>
      {upper(box.text)}
    </div>
  )
}

function DialogueBox({ box, speaker }: { box: PanelBox; speaker: string }) {
  return (
    <div className="pv-box pv-box-dialogue" data-beat-ref={box.ref}>
      <span className="pv-balloon-speaker">{upper(speaker)}</span>
      {upper(box.text)}
    </div>
  )
}

/**
 * The dialogue cascade: one grid ROW per spoken line in script order, one
 * COLUMN per speaker. Reading top-to-bottom replays the exchange in the order
 * it was actually said; horizontal position keeps every balloon over its own
 * speaker's figure. A speaker's LAST balloon (highest `turn` in its column)
 * gets the downward tail; earlier balloons from the same speaker get none —
 * exactly as a real letterer chains a speaker's successive balloons together.
 *
 * Do NOT stack a speaker's lines together instead of cascading by turn — that
 * destroys the back-and-forth and is the exact bug this design replaced.
 */
function DialogueCascade({ panel }: { panel: ModelPanel }) {
  const columns = panel.columns ?? []
  const turns = panel.turns ?? 0
  if (columns.length === 0 || turns <= 0) return null

  const lastTurnByCol = new Map<number, number>()
  columns.forEach((col, cIdx) => {
    for (const box of col.boxes) {
      if (box.turn == null) continue
      const c = box.column ?? cIdx
      lastTurnByCol.set(c, Math.max(lastTurnByCol.get(c) ?? -1, box.turn))
    }
  })

  // Each speaker's figure sits in the SAME grid row as that speaker's OWN
  // last balloon -- not a single shared row at the foot of the whole cascade.
  // A shared final row disconnects a figure from its own dialogue whenever
  // OTHER columns keep talking after this speaker's last line: with three
  // speakers where one speaks only once early on, a shared-row figure sits
  // two, three, sometimes many rows below the balloon it actually belongs
  // to, with unrelated speakers' balloons visibly in between. Anchoring each
  // figure to lastTurnByCol -- data already computed for the balloon tail --
  // keeps every figure mathematically adjacent to the dialogue it answers
  // for, deterministically, with no separate "figure row" concept at all.
  const cells: React.ReactNode[] = []
  columns.forEach((col, cIdx) => {
    for (const box of col.boxes) {
      if (box.turn == null) continue
      const c = box.column ?? cIdx
      const isLast = box.turn === lastTurnByCol.get(c)
      cells.push(
        <div
          key={box.ref}
          className="pv-dialogue-cell"
          style={{ gridColumn: c + 1, gridRow: box.turn + 1 }}
        >
          <DialogueBox box={box} speaker={col.name} />
          {isLast && (
            <>
              <div className="pv-balloon-tail" />
              <div className="pv-figure-cell">
                <FigureSvg kind={col.figure || DEFAULT_FIGURE} />
                <div className="pv-speaker-name">{upper(col.name)}</div>
              </div>
            </>
          )}
        </div>,
      )
    }
  })

  return (
    <div
      className="pv-dialogue-grid"
      style={{
        gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
        gridTemplateRows: `repeat(${turns}, auto)`,
      }}
    >
      {cells}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel + page
// ---------------------------------------------------------------------------

/**
 * For each panel that HOSTS an overlapping "inset" neighbour, how much of its
 * own vertical flow to reserve (topFrac, bottomFrac), each 0..1. Ported from
 * panel_preview.py's `_inset_reservations` — an inset panel is deliberately
 * drawn on top of a larger neighbour, and without this a host's narration can
 * start flush in the exact corner the inset covers.
 */
function insetHosts(panels: ModelPanel[]): {
  hosted: Map<string, ModelPanel[]>
  insetRefs: Set<string>
} {
  const hosted = new Map<string, ModelPanel[]>()
  const insetRefs = new Set<string>()
  const insets = panels.filter((p) => p.note === 'inset')
  if (insets.length === 0) return { hosted, insetRefs }

  for (const ins of insets) {
    const [ic, ir, iw, ih] = ins.rect
    let bestHost: ModelPanel | null = null
    let bestArea = 0
    for (const host of panels) {
      if (host === ins || host.note === 'inset') continue
      const [hc, hr, hw, hh] = host.rect
      const overlap =
        Math.max(0, Math.min(hc + hw, ic + iw) - Math.max(hc, ic)) *
        Math.max(0, Math.min(hr + hh, ir + ih) - Math.max(hr, ir))
      if (overlap > bestArea) {
        bestArea = overlap
        bestHost = host
      }
    }
    // An inset with no overlapping host stays a normal grid item -- it has
    // nothing to sit inside and nothing to cover.
    if (!bestHost) continue
    insetRefs.add(ins.ref)
    const list = hosted.get(bestHost.ref)
    if (list) list.push(ins)
    else hosted.set(bestHost.ref, [ins])
  }
  return { hosted, insetRefs }
}

/**
 * Measures a panel body's rendered content against its (clipped) box height
 * after every render and re-measures on any resize, so `.pv-panel-overflow-tag`
 * only shows when content genuinely didn't fit. Ported from
 * `tools/panel_preview.py`'s inline `_OVERFLOW_SCRIPT` (which reads
 * scrollHeight vs clientHeight once layout has happened) — same signal, React
 * idiom instead of a raw `<script>`.
 *
 * `useLayoutEffect` runs synchronously after DOM mutations and before the
 * browser paints, so the tag never visibly flashes in the wrong state.
 * ResizeObserver is optional (guarded — not available in every test/SSR
 * environment) and only refines the initial measurement on a later resize;
 * the effect always measures at least once on mount/update regardless.
 */
function usePanelOverflow(deps: unknown): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 1)
    measure()
    window.addEventListener('resize', measure)
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    }
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps])

  return [ref, overflows]
}

/** A panel's own contents, without the outer grid-placed shell. Shared by a
 *  normal panel and by a nested inset, so both render identically inside. */
function PanelBody({ panel, bodyRef }: {
  panel: ModelPanel
  bodyRef?: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="pv-panel-body" ref={bodyRef}>
      {panel.narration.length > 0 && (
        <div className="pv-narration-stack">
          {panel.narration.map((b) => (
            <CaptionBox key={b.ref} box={b} />
          ))}
        </div>
      )}
      {panel.sfx.length > 0 && (
        <div className="pv-sfx-stack">
          {panel.sfx.map((b) => (
            <SfxBox key={b.ref} box={b} />
          ))}
        </div>
      )}
      <DialogueCascade panel={panel} />
      {/* Characters the Art line puts in this panel who say nothing here.
          Drawing only speakers made them disappear, so a reviewer could not
          see who was actually in the scene. Marked distinctly because their
          presence is inferred from the Art line, not stated by a speaker
          tag -- a wrong guess must be visible, not silently mixed in. */}
      {(panel.silent?.length ?? 0) > 0 && (
        <div className="pv-silent-row">
          {panel.silent!.map((s) => (
            <div className="pv-figure-cell pv-figure-silent" key={`silent-${s.name}`}>
              <FigureSvg kind={s.figure || DEFAULT_FIGURE} />
              <div className="pv-speaker-name">{upper(s.name)}</div>
              <div className="pv-silent-tag">no line here</div>
            </div>
          ))}
        </div>
      )}
      <div className="pv-art-brief" data-beat-ref={panel.artRef}>
        {panel.artBrief || ''}
      </div>
    </div>
  )
}

function PanelBlock({ panel, insets = [] }: { panel: ModelPanel; insets?: ModelPanel[] }) {
  const [col, row, w, h] = panel.rect
  const crowded = !!panel.crowded
  const [bodyRef, overflows] = usePanelOverflow(panel)

  return (
    <div
      className={crowded ? 'pv-panel pv-panel-crowded' : 'pv-panel'}
      data-panel-ref={panel.ref}
      style={{ gridColumn: `${col + 1} / span ${w}`, gridRow: `${row + 1} / span ${h}` }}
    >
      <div className="pv-panel-number">{panel.number}</div>
      {panel.note && <div className="pv-panel-note">{panel.note}</div>}
      {overflows && <div className="pv-panel-overflow-tag">OVERFLOWS</div>}
      <PanelBody panel={panel} bodyRef={bodyRef} />
      {/* An INSET panel overlaps its host in the finished comic. Drawing that
          overlap here hid the host's own text underneath it -- and the old
          fix (reserving a top/bottom BAND of the host, by fraction) could
          never protect a CORNER region, which is the shape an inset actually
          is. Since this view exists to READ the script, no panel may cover
          another's words: the inset is nested inside its host and badged
          instead. This also matches what the Word renderer already does. */}
      {insets.map((ins) => (
        <div className="pv-inset" data-panel-ref={ins.ref} key={ins.ref}>
          <div className="pv-inset-label">
            Inset &middot; panel {ins.number}
          </div>
          <PanelBody panel={ins} />
        </div>
      ))}
    </div>
  )
}

function PageBlock({ page, aspect }: { page: ModelPage; aspect: number }) {
  const { hosted, insetRefs } = insetHosts(page.panels)
  return (
    <div className="pv-page-shell">
      <div className="pv-page-label">
        <span className="pv-page-num">Page {page.number}</span>
        <span className="pv-page-meta">
          {page.panels.length} panel{page.panels.length === 1 ? '' : 's'} &middot; layout {page.layoutId}
        </span>
      </div>
      <section
        className="pv-comic-page"
        data-page-ref={page.ref}
        data-aspect={aspect}
      >
        {page.panels
          .filter((p) => !insetRefs.has(p.ref))
          .map((p) => (
            <PanelBlock key={p.ref} panel={p} insets={hosted.get(p.ref) ?? []} />
          ))}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function PanelView({ model }: { model: PanelModel }) {
  const aspect = model.aspect || 1.44
  const errors = model.errors ?? []

  return (
    <div className="pv-root">
      <style>{PV_CSS}</style>
      {errors.length > 0 && (
        <div className="pv-errors">
          <strong>Script errors</strong>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {model.pages.map((page) => (
        <PageBlock key={page.ref} page={page} aspect={aspect} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CSS — one inline stylesheet, scoped under .pv-root so it can't leak into or
// collide with the app's own (Tailwind-based) styles. Values ported from
// panel_preview.py's _CSS, with the one deliberate divergence noted at the
// top of this file (panels never clip/scroll; a box grows its panel).
// ---------------------------------------------------------------------------

const PV_CSS = `
.pv-root {
  --pv-ink: #1a1a1a;
  --pv-paper: #ffffff;
  --pv-panel-border: #1a1a1a;
  --pv-caption-bg: #fbf3d9;
  --pv-caption-rule: #b8860b;
  --pv-balloon-bg: #ffffff;
  --pv-balloon-border: #1a1a1a;
  --pv-sfx-color: #a6132c;
  --pv-note-bg: #1a1a1a;
  --pv-note-fg: #ffffff;
  --pv-brief-color: #6b6b6b;
  --pv-crowded-bg: #fff2f2;
  --pv-error-bg: #fdecea;
  --pv-error-border: #c0392b;
  color: var(--pv-ink);
  font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
}

.pv-root * { box-sizing: border-box; }

.pv-errors {
  margin: 0 0 16px;
  padding: 10px 14px;
  background: var(--pv-error-bg);
  border: 1px solid var(--pv-error-border);
  border-radius: 4px;
  font-size: 12px;
}
.pv-errors ul { margin: 4px 0 0; padding-left: 18px; }

/* A page must read as a distinct SHEET and a panel as a division within it.
   At 11px grey the page label was easy to miss entirely, so scrolling a
   48-page script gave no clear sense of where one page ended and the next
   began. The page now carries a solid header bar and a heavy frame; panels
   carry a filled numbered badge. */
.pv-page-shell {
  margin: 0 0 44px;
  background: var(--pv-paper);
  border: 2px solid var(--pv-ink);
  border-radius: 3px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}

.pv-page-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  background: var(--pv-ink);
  color: var(--pv-paper);
  padding: 7px 12px;
}
.pv-page-num {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.pv-page-meta {
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  opacity: 0.75;
}

.pv-comic-page {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-template-rows: repeat(16, minmax(28px, auto));
  gap: 2mm;
  padding: 4mm;
}

.pv-panel {
  position: relative;
  border: 1.5px solid var(--pv-panel-border);
  background: var(--pv-paper);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 2px 4px 3px;
  min-width: 0;
  min-height: 0;
}

.pv-panel-crowded { background: var(--pv-crowded-bg); }

/* A nested inset: its own bordered box inside its host, clearly labelled.
   It sits in normal flow so it can never cover the host's text. */
.pv-inset {
  flex: 0 0 auto;
  margin-top: 6px;
  border: 1.5px double var(--pv-panel-border);
  border-radius: 2px;
  padding: 4px 5px 3px;
  background: var(--pv-paper);
}
.pv-inset-label {
  font-size: 9px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #666;
  margin-bottom: 3px;
}
.pv-inset .pv-panel-body { padding-top: 0; overflow: visible; }

/* Spec §3.3: the page box is fixed, so a panel's own box never grows past
   its grid row -- content that doesn't fit clips here instead of overlapping
   the panel below (the bug this replaced: overflow visible + height auto let
   a panel grow past its row with nothing reserving that extra space). */
.pv-panel-overflow-tag {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: var(--pv-error-border);
  color: #fff;
  font-size: 9px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 2px;
  z-index: 6;
  line-height: 1.4;
}

.pv-panel-note {
  position: absolute;
  top: 2px;
  right: 2px;
  background: var(--pv-note-bg);
  color: var(--pv-note-fg);
  font-size: 9px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 2px;
  z-index: 5;
  line-height: 1.4;
}

.pv-panel-number {
  position: absolute;
  top: 0;
  left: 0;
  min-width: 20px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--pv-paper);
  background: var(--pv-ink);
  padding: 1px 5px 2px;
  border-bottom-right-radius: 4px;
  z-index: 5;
  line-height: 1.4;
}

.pv-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 19px;
  overflow: hidden;
}

.pv-narration-stack, .pv-sfx-stack {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 0 0 auto;
}

.pv-box {
  font-size: 13px;
  line-height: 1.35;
  text-transform: uppercase;
  word-break: break-word;
}

.pv-box-caption {
  background: var(--pv-caption-bg);
  border: 1px solid #d8c07a;
  border-left: 3px solid var(--pv-caption-rule);
  padding: 6px 9px;
}

.pv-caption-speaker {
  display: block;
  font-size: 10px;
  font-weight: 700;
  color: var(--pv-caption-rule);
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}

.pv-sfx-box {
  font-size: 15px;
  font-style: italic;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--pv-sfx-color);
  text-transform: uppercase;
  text-align: center;
}

.pv-dialogue-grid {
  flex: 0 0 auto;
  margin-top: auto;
  display: grid;
  column-gap: 3px;
  row-gap: 2px;
  align-items: end;
  justify-items: center;
}

.pv-dialogue-cell, .pv-figure-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  max-width: 100%;
}

.pv-box-dialogue {
  background: var(--pv-balloon-bg);
  border: 1.5px solid var(--pv-balloon-border);
  border-radius: 10px;
  padding: 6px 10px;
  text-align: center;
  max-width: 100%;
}

.pv-balloon-speaker {
  display: block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #777;
  margin-bottom: 2px;
}

.pv-balloon-tail {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 6px solid var(--pv-balloon-border);
  margin: -1px auto 0;
}

.pv-figure-svg {
  width: 26px;
  height: auto;
  stroke: currentColor;
  stroke-width: 3;
  fill: none;
  color: #333;
  display: block;
  margin: 2px auto 0;
}

.pv-speaker-name {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #444;
  text-transform: uppercase;
  margin-top: 2px;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pv-silent-row {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
  margin-top: 6px;
}
.pv-figure-silent { opacity: 0.55; }
.pv-figure-silent .pv-figure-svg { stroke-dasharray: 5 4; }
.pv-silent-tag {
  font-size: 8px;
  font-style: italic;
  color: #888;
  text-align: center;
  margin-top: 1px;
}

.pv-art-brief {
  flex: 0 0 auto;
  font-size: 11px;
  font-style: italic;
  color: var(--pv-brief-color);
  text-transform: none;
  border-top: 1px dotted #ccc;
  padding-top: 4px;
  margin-top: 4px;
}
`

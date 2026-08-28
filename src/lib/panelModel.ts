// Types + parser for the panel-preview model — the JSON interchange emitted by
// the content pipeline's `tools/panel_model.py` `to_dict()` (Python, in the
// OTHER repo). This file mirrors that shape field-for-field, camelCase to
// camelCase, so a change on either side is a visible diff on the other.
//
// The gated R2 object at `panels/{line}/{slug}.json` may not exist yet (panel
// view not published for this comic), may be stale, or — since it's a
// hand-rolled JSON contract, not a generated client — may not even parse. All
// three degrade to `null` here so the caller renders an empty/disabled state
// instead of crashing the comic page.

export interface PanelBox {
  ref: string
  kind: 'caption' | 'dialogue' | 'sfx'
  text: string
  speaker: string | null
  srcCount: number
  /** Reading-order row within the panel's dialogue cascade (null for narration/SFX). */
  turn: number | null
  /** Which speaker column this box belongs to (null for narration/SFX). */
  column: number | null
}

export interface SpeakerColumn {
  name: string
  /** Stick-figure silhouette key (e.g. "adult" | "man" | "woman" | "boy" | "girl" | "neutral"). */
  figure: string
  boxes: PanelBox[]
}

export interface ModelPanel {
  number: number
  ref: string
  /** [col, row, w, h] — zero-based on the page grid. */
  rect: [number, number, number, number]
  note: string | null
  artRef: string
  artBrief: string
  artSrcCount: number
  crowded: boolean
  /** Row count of the dialogue cascade (columns.length columns × turns+1 rows). */
  turns: number
  narration: PanelBox[]
  columns: SpeakerColumn[]
  sfx: PanelBox[]
  /** Characters the Art line places in the panel who have no line in it.
   *  Inferred from the Art line against the comic's own speaking cast, so it
   *  is a best guess -- rendered visibly distinct from real speakers. */
  silent?: { name: string; figure: string }[]
}

export interface ModelPage {
  number: number
  ref: string
  layoutId: string
  panels: ModelPanel[]
}

export interface PanelModel {
  schema: number
  title: string
  aspect: number
  grid: { cols: number; rows: number }
  errors: string[]
  pages: ModelPage[]
}

const SUPPORTED_SCHEMA = 1

/**
 * Parse the gated panel-model JSON text into a `PanelModel`, or `null` for
 * anything that is not a recognizable v1 model: non-JSON, a non-object, a
 * missing/mismatched `schema`, or a null/absent input. A stale object from a
 * future schema version renders the empty state rather than being guessed at.
 */
export function parsePanelModel(text: string | null): PanelModel | null {
  if (!text) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (obj.schema !== SUPPORTED_SCHEMA) return null
  if (!Array.isArray(obj.pages)) return null
  return parsed as PanelModel
}

/** The R2 key a comic's panel model is published under. */
export function panelsKeyFor(line: string, slug: string): string {
  return `panels/${line}/${slug}.json`
}

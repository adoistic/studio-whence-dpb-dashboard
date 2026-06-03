import type { ResearchSource } from '@/types/content'

export interface Citation {
  sourceTitle: string
  fileTitle: string
}

/** Build the path→citation map from a single figure's sources (the subject's).
 * Same-figure cites resolve to full titles; cross-figure cites fall back to the
 * path-stem label the tooltip already handles. */
export function citationMapFromSources(sources: ResearchSource[]): Map<string, Citation> {
  const map = new Map<string, Citation>()
  for (const src of sources) {
    for (const f of src.files) map.set(f.path, { sourceTitle: src.title, fileTitle: f.title })
  }
  return map
}

// Unescape the markdown-escaped punctuation that leaks as literal backslashes in
// a raw-text preview (e.g. "\(" → "(", "\." → "."). Research files are markdown,
// so the reader processes these — but the tooltip shows raw text.
const _MD_ESCAPE = /\\([\\`*_{}[\]()#+\-.!>~|"'])/g

/** Clean a raw markdown line for a plain-text preview: unescape md-escaped
 * punctuation, drop a leading heading/blockquote marker, and trim. */
export function cleanExcerptLine(s: string): string {
  return s
    .replace(_MD_ESCAPE, '$1')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*>\s?/, '')
    .trim()
}

/** End-truncate to maxChars on a word boundary, appending … when cut. */
export function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s
  return s.slice(0, maxChars).replace(/\s+\S*$/, '').trimEnd() + '…'
}

/** The cited passage for a hover preview. Research files store each paragraph as
 * one line, so a multi-line window becomes a wall of text — we show the single
 * cited paragraph (or the nearest non-blank line within ±3 if the cited line is
 * blank), cleaned and truncated. Empty string if nothing usable is found. */
export function excerptPassage(text: string, line: number, maxChars = 300): string {
  const all = text.split('\n')
  const idx = line - 1
  let raw = (all[idx] ?? '').trim()
  for (let d = 1; d <= 3 && !raw; d++) {
    raw = (all[idx - d] ?? '').trim() || (all[idx + d] ?? '').trim()
  }
  return truncate(cleanExcerptLine(raw), maxChars)
}

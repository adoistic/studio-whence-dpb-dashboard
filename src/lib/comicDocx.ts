// Parse the rendered draft HTML (the cs-* semantic structure produced by the
// content pipeline's render_draft_html) into a plain page/panel/beat tree, the
// shape the in-app "Download DOCX" button feeds to docx-js. Kept pure (DOMParser
// only, no docx import) so it can be unit-tested without the heavy library.

// `srcs` carries the beat's provenance as `path:line`, read from the citation
// markers' data-key / data-line. The reader text strips the markers, but the Word
// export prints them: Diamond reviews that file as the master script, and a master
// with "zero [src:] tags" beside a doc pack full of them was flagged on four books
// in the 7-8 Oct 2026 outstanding-items files.
export type Beat =
  | { kind: 'caption'; speaker: string; text: string; srcs?: string[] }
  | { kind: 'dialogue'; name: string; text: string; srcs?: string[] }
  | { kind: 'sfx'; text: string; srcs?: string[] }

export interface Panel {
  number: string
  art: string | null
  artSrcs?: string[]
  beats: Beat[]
}

export interface Page {
  number: string
  panels: Panel[]
}

export interface ParsedDraft {
  pages: Page[]
}

/** Strip the inline citation markers (superscripts) so they don't leak into the
 * reader text, then return the trimmed textContent of an element. */
function cleanText(el: Element): string {
  // Operate on a clone so the live DOM (used elsewhere) is untouched.
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.cs-src, .cs-src-art').forEach((n) => n.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Read a leading inline marker's text (e.g. .cs-speaker / .cs-name), then the
 * remaining text of the parent with that marker removed. */
function speakerAndRest(el: Element, markerSel: string): { who: string; text: string } {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.cs-src, .cs-src-art').forEach((n) => n.remove())
  const marker = clone.querySelector(markerSel)
  const who = (marker?.textContent ?? '').replace(/\s+/g, ' ').trim()
  marker?.remove()
  const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
  return { who, text }
}

/** The `path:line` of every citation marker inside `el`, in document order. */
function citations(el: Element, sel: string): string[] {
  const out: string[] = []
  el.querySelectorAll(sel).forEach((a) => {
    const key = a.getAttribute('data-key')
    const line = a.getAttribute('data-line')
    if (key) out.push(line ? `${key}:${line}` : key)
  })
  return out
}

/**
 * Parse the cs-* draft HTML into pages → panels → beats. Pure: relies only on a
 * DOMParser (available in the browser and in jsdom under test).
 */
export function parseDraftHtml(html: string): ParsedDraft {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const pages: Page[] = []

  for (const sectionEl of Array.from(doc.querySelectorAll('section.cs-page'))) {
    const heading = sectionEl.querySelector('.cs-page-h')
    const pageNum = (heading?.textContent ?? '').replace(/[^0-9]/g, '') || String(pages.length + 1)
    const page: Page = { number: pageNum, panels: [] }

    for (const panelEl of Array.from(sectionEl.querySelectorAll('.cs-panel'))) {
      const panelHead = panelEl.querySelector('.cs-panel-h')
      const panelNum = (panelHead?.textContent ?? '').replace(/[^0-9]/g, '') || String(page.panels.length + 1)
      const panel: Panel = { number: panelNum, art: null, artSrcs: [], beats: [] }

      const artEl = panelEl.querySelector('.cs-art')
      if (artEl) {
        const art = cleanText(artEl)
        if (art) panel.art = art
        panel.artSrcs = citations(artEl, '.cs-src-art, .cs-src')
      }

      for (const beatEl of Array.from(panelEl.querySelectorAll('.cs-caption, .cs-dialogue, .cs-sfx'))) {
        const srcs = citations(beatEl, '.cs-src, .cs-src-art')
        if (beatEl.classList.contains('cs-caption')) {
          const { who, text } = speakerAndRest(beatEl, '.cs-speaker')
          panel.beats.push({ kind: 'caption', speaker: who, text, srcs })
        } else if (beatEl.classList.contains('cs-dialogue')) {
          const { who, text } = speakerAndRest(beatEl, '.cs-name')
          panel.beats.push({ kind: 'dialogue', name: who, text, srcs })
        } else {
          panel.beats.push({ kind: 'sfx', text: cleanText(beatEl), srcs })
        }
      }

      page.panels.push(panel)
    }

    pages.push(page)
  }

  return { pages }
}

// ── Inside covers (markdown → simple blocks) ───────────────────────────────
// The Word export appends the book's inside-covers.md from the doc pack so the
// master file and the doc pack cannot disagree. That file is hard-wrapped
// markdown mixing the printed copy (blockquotes, tables) with production notes
// (italic paragraphs), so it is grouped into blocks and the notes are marked.

export type IcBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'para'; text: string; note: boolean }
  | { kind: 'quote'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'table'; rows: string[][] }

/** Inline markdown → plain text: bold/italic markers and code ticks removed. */
export function plainInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=$|[\s).,;:!?])/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function insideCoversBlocks(md: string): IcBlock[] {
  const out: IcBlock[] = []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  const isBreak = (l: string) =>
    !l.trim() || /^#{1,6}\s/.test(l) || /^\s*\|/.test(l) || /^\s*>/.test(l) || /^\s*[-*]\s+/.test(l) || /^-{3,}\s*$/.test(l.trim())
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim() || /^-{3,}\s*$/.test(l.trim())) { i++; continue }
    const h = /^(#{1,6})\s+(.*)$/.exec(l)
    if (h) { out.push({ kind: 'heading', level: h[1].length, text: plainInline(h[2]) }); i++; continue }
    if (/^\s*\|/.test(l)) {
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => plainInline(c))
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i++
      }
      out.push({ kind: 'table', rows })
      continue
    }
    if (/^\s*>/.test(l)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++ }
      out.push({ kind: 'quote', text: plainInline(buf.join(' ')) })
      continue
    }
    const b = /^\s*[-*]\s+(.*)$/.exec(l)
    if (b) {
      const buf = [b[1]]
      i++
      while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i])) { buf.push(lines[i].trim()); i++ }
      out.push({ kind: 'bullet', text: plainInline(buf.join(' ')) })
      continue
    }
    const buf: string[] = []
    while (i < lines.length && !isBreak(lines[i])) { buf.push(lines[i].trim()); i++ }
    const raw = buf.join(' ')
    const note = /^\*[^*]/.test(raw) && /[^*]\*$/.test(raw)
    out.push({ kind: 'para', text: plainInline(note ? raw.slice(1, -1) : raw), note })
  }
  return out
}

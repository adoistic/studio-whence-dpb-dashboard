// Parse the rendered draft HTML (the cs-* semantic structure produced by the
// content pipeline's render_draft_html) into a plain page/panel/beat tree, the
// shape the in-app "Download DOCX" button feeds to docx-js. Kept pure (DOMParser
// only, no docx import) so it can be unit-tested without the heavy library.

export type Beat =
  | { kind: 'caption'; speaker: string; text: string }
  | { kind: 'dialogue'; name: string; text: string }
  | { kind: 'sfx'; text: string }

export interface Panel {
  number: string
  art: string | null
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
      const panel: Panel = { number: panelNum, art: null, beats: [] }

      const artEl = panelEl.querySelector('.cs-art')
      if (artEl) {
        const art = cleanText(artEl)
        if (art) panel.art = art
      }

      for (const beatEl of Array.from(panelEl.querySelectorAll('.cs-caption, .cs-dialogue, .cs-sfx'))) {
        if (beatEl.classList.contains('cs-caption')) {
          const { who, text } = speakerAndRest(beatEl, '.cs-speaker')
          panel.beats.push({ kind: 'caption', speaker: who, text })
        } else if (beatEl.classList.contains('cs-dialogue')) {
          const { who, text } = speakerAndRest(beatEl, '.cs-name')
          panel.beats.push({ kind: 'dialogue', name: who, text })
        } else {
          panel.beats.push({ kind: 'sfx', text: cleanText(beatEl) })
        }
      }

      page.panels.push(panel)
    }

    pages.push(page)
  }

  return { pages }
}

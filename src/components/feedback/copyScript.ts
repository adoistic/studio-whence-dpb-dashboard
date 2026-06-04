// Pure serializers turning the rendered comic draft HTML (plus optional
// editorial threads) into copy-pasteable plain text. No React / Firestore — the
// DOM is parsed with DOMParser (available in browsers and jsdom for tests).
//
// Two outputs:
//   serializeScript            → the script body alone, panel-grammar plain text.
//   serializeScriptWithComments → the same body with inline 〔C#〕 markers at each
//                                 anchored unit, plus a COMMENTS appendix.

import {
  CATEGORY_LABELS,
  STATUS_COLOR,
  type Anchor,
  type Category,
  type Status,
  type Thread,
  type FeedbackNode,
  toMillis,
} from '@/lib/feedbackTypes'

// ─── DOM walk ─────────────────────────────────────────────────────────────

interface BeatUnit {
  kind: 'beat'
  ref: string | null
  line: string // already-formatted (Art: … / CAPTION (X): … / NAME: … / SFX: …)
}
interface PanelUnit {
  kind: 'panel'
  ref: string | null
  header: string // "Panel 1"
  beats: BeatUnit[]
}
interface PageUnit {
  kind: 'page'
  ref: string | null
  header: string // "Page 13"
  panels: PanelUnit[]
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** A beat element's visible text, with provenance markers (`.cs-src`,
 *  `.cs-src-art`) and the speaker/name span removed. */
function beatBodyText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone
    .querySelectorAll('.cs-src, .cs-src-art, .cs-speaker, .cs-name')
    .forEach((n) => n.remove())
  return collapse(clone.textContent ?? '')
}

function speakerOf(el: Element, cls: string): string {
  const span = el.querySelector(cls)
  return span ? collapse(span.textContent ?? '') : ''
}

/** Format a single beat <p> into its plain script line. */
function formatBeat(el: Element): string {
  const body = beatBodyText(el)
  if (el.classList.contains('cs-art')) return `Art: ${body}`
  if (el.classList.contains('cs-caption')) {
    const speaker = speakerOf(el, '.cs-speaker')
    return speaker ? `CAPTION (${speaker}): ${body}` : `CAPTION: ${body}`
  }
  if (el.classList.contains('cs-dialogue')) {
    const name = speakerOf(el, '.cs-name')
    return name ? `${name}: ${body}` : body
  }
  if (el.classList.contains('cs-sfx')) return `SFX: ${body}`
  return body
}

/** Parse the draft HTML into an ordered page → panel → beat tree. */
function parseScript(draftHtml: string): PageUnit[] {
  const doc = new DOMParser().parseFromString(draftHtml, 'text/html')
  const pages: PageUnit[] = []
  doc.querySelectorAll('section.cs-page').forEach((pageEl) => {
    const header = collapse(pageEl.querySelector('.cs-page-h')?.textContent ?? '')
    const page: PageUnit = {
      kind: 'page',
      ref: pageEl.getAttribute('data-page-ref'),
      header,
      panels: [],
    }
    pageEl.querySelectorAll('.cs-panel').forEach((panelEl) => {
      const panel: PanelUnit = {
        kind: 'panel',
        ref: panelEl.getAttribute('data-panel-ref'),
        header: collapse(panelEl.querySelector('.cs-panel-h')?.textContent ?? ''),
        beats: [],
      }
      panelEl
        .querySelectorAll('.cs-art, .cs-caption, .cs-dialogue, .cs-sfx')
        .forEach((beatEl) => {
          panel.beats.push({
            kind: 'beat',
            ref: beatEl.getAttribute('data-beat-ref'),
            line: formatBeat(beatEl),
          })
        })
      page.panels.push(panel)
    })
    pages.push(page)
  })
  return pages
}

// ─── Plain serializer ───────────────────────────────────────────────────────

/** Build the plain script body. `markers` maps a unit ref → its 〔C#〕 suffix. */
function renderBody(pages: PageUnit[], markers?: Map<string, string>): string {
  const mark = (ref: string | null): string =>
    ref && markers?.get(ref) ? ` ${markers.get(ref)}` : ''

  const pageBlocks = pages.map((page) => {
    const lines: string[] = [`## ${page.header}${mark(page.ref)}`]
    page.panels.forEach((panel) => {
      lines.push('') // blank line before each panel
      lines.push(`**${panel.header}**${mark(panel.ref)}`)
      panel.beats.forEach((beat) => {
        lines.push(`${beat.line}${mark(beat.ref)}`)
      })
    })
    return lines.join('\n')
  })

  return pageBlocks.join('\n\n') // pages separated by a blank line
}

export function serializeScript(draftHtml: string): string {
  return renderBody(parseScript(draftHtml))
}

// ─── With-comments serializer ─────────────────────────────────────────────

const LEGEND =
  '> Comments are marked 〔C#〕 at their anchored unit and listed under COMMENTS. Status + category shown per comment.'

function categoryLabel(c: Category | undefined): string {
  return (CATEGORY_LABELS[(c ?? 'other') as Category] ?? 'Other').toUpperCase()
}
function statusLabel(s: Status | undefined): string {
  return (STATUS_COLOR[(s ?? 'open') as Status]?.label ?? 'Open').toUpperCase()
}

/** Human-readable location for one anchor, e.g. "Page 13 Panel 1 (Art)". */
function anchorLocation(a: Anchor): string {
  if (a.kind === 'page') return `Page ${a.page}`
  if (a.kind === 'panel') return `Panel ${a.panel} of Page ${a.page}`
  // beat: derive its kind from the ref suffix.
  const suffix = a.ref.split('.').pop() ?? ''
  const beatKind = suffix === 'art' ? 'Art' : 'caption=beat'
  return `Page ${a.page} Panel ${a.panel} (${beatKind})`
}

function authorLabel(n: FeedbackNode): string {
  return n.authorName || n.authorEmail || 'Unknown'
}

export function serializeScriptWithComments(
  draftHtml: string,
  threads: Thread[],
  opts?: { title?: string },
): string {
  const pages = parseScript(draftHtml)

  // Every unit ref present in the rendered script (for orphan detection).
  const presentRefs = new Set<string>()
  for (const page of pages) {
    if (page.ref) presentRefs.add(page.ref)
    for (const panel of page.panels) {
      if (panel.ref) presentRefs.add(panel.ref)
      for (const beat of panel.beats) if (beat.ref) presentRefs.add(beat.ref)
    }
  }

  // Document position of each ref (page→panel→beat order) for ordering anchored
  // threads top-to-bottom by their first anchor.
  const refPos = new Map<string, number>()
  let pos = 0
  for (const page of pages) {
    if (page.ref) refPos.set(page.ref, pos++)
    for (const panel of page.panels) {
      if (panel.ref) refPos.set(panel.ref, pos++)
      for (const beat of panel.beats) if (beat.ref) refPos.set(beat.ref, pos++)
    }
  }

  // Visible (non-hidden) threads, split into anchored vs general.
  const visible = threads.filter((t) => !t.root.hidden)
  const anchored = visible.filter((t) => t.root.anchors.length > 0)
  const general = visible.filter((t) => t.root.anchors.length === 0)

  // Anchored → ordered by the document position of their FIRST anchor's ref.
  // An anchor whose ref isn't in the script (orphan) sorts to the end.
  const firstPos = (t: Thread): number => {
    const positions = t.root.anchors
      .map((a) => refPos.get(a.ref))
      .filter((p): p is number => p !== undefined)
    return positions.length ? Math.min(...positions) : Number.MAX_SAFE_INTEGER
  }
  const anchoredOrdered = anchored
    .map((t, i) => ({ t, i }))
    .sort((a, b) => firstPos(a.t) - firstPos(b.t) || a.i - b.i)
    .map((x) => x.t)

  // General → createdAt order (oldest first).
  const generalOrdered = general
    .slice()
    .sort((a, b) => toMillis(a.root.createdAt) - toMillis(b.root.createdAt))

  // Assign numbers + build the ref → markers map.
  const markers = new Map<string, string>()
  const numberOf = new Map<string, string>() // threadId → "C1"/"G1"
  anchoredOrdered.forEach((t, idx) => {
    const tag = `C${idx + 1}`
    numberOf.set(t.root.id, tag)
    for (const a of t.root.anchors) {
      if (presentRefs.has(a.ref)) {
        const existing = markers.get(a.ref)
        markers.set(a.ref, existing ? `${existing}〔${tag}〕` : `〔${tag}〕`)
      }
    }
  })
  generalOrdered.forEach((t, idx) => {
    numberOf.set(t.root.id, `G${idx + 1}`)
  })

  // ── Assemble ──
  const out: string[] = []
  if (opts?.title) out.push(`# ${opts.title}   (script + editorial comments)`)
  out.push(LEGEND)
  out.push('') // blank line before the body
  out.push(renderBody(pages, markers))

  // Appendix.
  const appendix: string[] = ['', '─── COMMENTS ───']
  const entry = (t: Thread): void => {
    const tag = numberOf.get(t.root.id) ?? '?'
    const where = t.root.anchors.length
      ? `anchored: ${t.root.anchors.map(anchorLocation).join(' + ')}`
      : 'whole comic'
    appendix.push(
      `〔${tag}〕  ${categoryLabel(t.root.category)} · ${statusLabel(t.root.status)} · ${where}`,
    )
    appendix.push(`   ${authorLabel(t.root)}: ${collapse(t.root.body)}`)
    for (const reply of t.replies) {
      appendix.push(`   → ${authorLabel(reply)}: ${collapse(reply.body)}`)
    }
  }
  anchoredOrdered.forEach(entry)
  generalOrdered.forEach(entry)

  out.push(appendix.join('\n'))
  return out.join('\n')
}

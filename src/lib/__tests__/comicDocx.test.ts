import { describe, expect, test } from 'vitest'
import { parseDraftHtml } from '@/lib/comicDocx'

// A minimal cs-* draft fixture: one page, one panel, with an art line carrying a
// citation marker, a caption (speaker + a .cs-src marker that MUST be stripped),
// a dialogue (name), and an sfx.
const FIXTURE = `
<section class="cs-page">
  <h2 class="cs-page-h">Page 1</h2>
  <div class="cs-panel">
    <p class="cs-panel-h">Panel 1</p>
    <p class="cs-art">A dusty Sialkot lane at dawn.<a class="cs-src-art" href="#" data-key="biographies/x/_books/d/src/ch1.md" data-line="12">3</a></p>
    <p class="cs-caption"><span class="cs-speaker">Little Chanakya</span>Listen close, doston.<a class="cs-src" href="#" data-key="biographies/x/_books/d/src/ch2.md" data-line="7">7</a></p>
    <p class="cs-dialogue"><span class="cs-name">DHARAMPAL</span>Main kaam karunga.</p>
    <p class="cs-sfx">DHAK DHAK</p>
  </div>
</section>
`

describe('parseDraftHtml', () => {
  const { pages } = parseDraftHtml(FIXTURE)

  test('nests one page with one panel', () => {
    expect(pages).toHaveLength(1)
    expect(pages[0].number).toBe('1')
    expect(pages[0].panels).toHaveLength(1)
    expect(pages[0].panels[0].number).toBe('1')
  })

  test('strips citation markers from art and caption', () => {
    const panel = pages[0].panels[0]
    expect(panel.art).toBe('A dusty Sialkot lane at dawn.')
    expect(panel.art).not.toContain('3')
    const caption = panel.beats.find((b) => b.kind === 'caption')
    expect(caption).toBeDefined()
    // The superscript "7" from .cs-src must not leak into the text.
    expect(caption && 'text' in caption ? caption.text : '').toBe('Listen close, doston.')
  })

  test('extracts speaker, name, and beat order', () => {
    const beats = pages[0].panels[0].beats
    expect(beats).toHaveLength(3)

    expect(beats[0]).toEqual({ kind: 'caption', speaker: 'Little Chanakya', text: 'Listen close, doston.', srcs: ['biographies/x/_books/d/src/ch2.md:7'] })
    expect(beats[1]).toEqual({ kind: 'dialogue', name: 'DHARAMPAL', text: 'Main kaam karunga.', srcs: [] })
    expect(beats[2]).toEqual({ kind: 'sfx', text: 'DHAK DHAK', srcs: [] })
  })
})

describe('parseDraftHtml provenance', () => {
  // Diamond reviews the Word export as the master script; it must carry the same
  // [src:] provenance the doc pack does (outstanding-items files, 7-8 Oct 2026).
  const { pages } = parseDraftHtml(FIXTURE)
  test('keeps each citation as path:line beside the text', () => {
    const panel = pages[0].panels[0]
    expect(panel.artSrcs).toEqual(['biographies/x/_books/d/src/ch1.md:12'])
    expect(panel.beats[1].srcs).toEqual([])
  })
})

import { insideCoversBlocks } from '@/lib/comicDocx'

describe('insideCoversBlocks', () => {
  const md = [
    '# Book — inside covers',
    '',
    '*Written 2026-08-14; revised against the',
    'verification round.*',
    '',
    '### Novak in Numbers',
    '',
    '> NOVAK IN NUMBERS — Figures checked',
    '> September 2026.',
    '',
    '| year | what happened |',
    '|---|---|',
    '| **2011** | Wimbledon. |',
    '',
    '- **Inside front cover:** Numbers · Tennis words',
    '  · About this book.',
    'A plain paragraph that is',
    'hard-wrapped.',
  ].join('\n')
  const blocks = insideCoversBlocks(md)
  test('joins hard-wrapped lines and marks production notes', () => {
    expect(blocks[0]).toEqual({ kind: 'heading', level: 1, text: 'Book — inside covers' })
    expect(blocks[1]).toEqual({ kind: 'para', text: 'Written 2026-08-14; revised against the verification round.', note: true })
    expect(blocks[3]).toEqual({ kind: 'quote', text: 'NOVAK IN NUMBERS — Figures checked September 2026.' })
  })
  test('keeps tables as rows without the separator', () => {
    expect(blocks[4]).toEqual({ kind: 'table', rows: [['year', 'what happened'], ['2011', 'Wimbledon.']] })
  })
  test('bullets absorb their indented continuation; plain paragraphs are not notes', () => {
    expect(blocks[5]).toEqual({ kind: 'bullet', text: 'Inside front cover: Numbers · Tennis words · About this book.' })
    expect(blocks[6]).toEqual({ kind: 'para', text: 'A plain paragraph that is hard-wrapped.', note: false })
  })
})

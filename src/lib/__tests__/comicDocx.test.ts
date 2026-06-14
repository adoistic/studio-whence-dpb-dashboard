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
    <p class="cs-art">A dusty Sialkot lane at dawn.<a class="cs-src-art" href="#">3</a></p>
    <p class="cs-caption"><span class="cs-speaker">Little Chanakya</span>Listen close, doston.<a class="cs-src" href="#">7</a></p>
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

    expect(beats[0]).toEqual({ kind: 'caption', speaker: 'Little Chanakya', text: 'Listen close, doston.' })
    expect(beats[1]).toEqual({ kind: 'dialogue', name: 'DHARAMPAL', text: 'Main kaam karunga.' })
    expect(beats[2]).toEqual({ kind: 'sfx', text: 'DHAK DHAK' })
  })
})

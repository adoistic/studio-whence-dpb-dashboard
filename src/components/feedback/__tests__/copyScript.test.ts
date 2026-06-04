import { describe, it, expect } from 'vitest'
import { serializeScript, serializeScriptWithComments } from '@/components/feedback/copyScript'
import type { Thread, FeedbackNode, Anchor } from '@/lib/feedbackTypes'

// One page, one panel, with an art beat, a caption-with-speaker, a dialogue and
// an SFX beat. Provenance markers (cs-src / cs-src-art) are embedded to prove
// they're stripped.
const DRAFT = `
<section class="cs-page" data-page-ref="p13"><h2 class="cs-page-h">Page 13</h2>
  <div class="cs-panel" data-panel-ref="p13.pl1"><p class="cs-panel-h">Panel 1</p>
    <p class="cs-art" data-beat-ref="p13.pl1.art">Eden Gardens at dusk.<a class="cs-src-art" href="#">ref</a></p>
    <p class="cs-caption" data-beat-ref="p13.pl1.b1"><span class="cs-speaker">Little Chanakya</span>The first ODI was a circus.<a class="cs-src" href="#">source</a></p>
    <p class="cs-dialogue" data-beat-ref="p13.pl1.b2"><span class="cs-name">VIRAT</span>I was relieved.</p>
    <p class="cs-sfx" data-beat-ref="p13.pl1.b3">KRAAACK</p>
  </div>
</section>`

function node(over: Partial<FeedbackNode>): FeedbackNode {
  return {
    id: 'x', comicId: 'c', line: 'biographies', parentId: null, anchors: [],
    authorEmail: 'a@x.com', authorName: 'Ankit', authorRole: 'allow',
    body: '', status: 'open', category: 'fact', comicVersion: 1, hidden: false,
    // Seeded/approved comments are published; the default copy is approved-only.
    published: true, createdAt: 1000, ...over,
  }
}
function anchor(over: Partial<Anchor>): Anchor {
  return { kind: 'beat', ref: 'p13.pl1.art', page: 13, panel: 1, snapshot: '', ...over }
}

describe('serializeScript', () => {
  it('produces the plain panel-grammar lines, no markers, no provenance text', () => {
    const out = serializeScript(DRAFT)
    expect(out).toContain('## Page 13')
    expect(out).toContain('**Panel 1**')
    expect(out).toContain('Art: Eden Gardens at dusk.')
    expect(out).toContain('CAPTION (Little Chanakya): The first ODI was a circus.')
    expect(out).toContain('VIRAT: I was relieved.')
    expect(out).toContain('SFX: KRAAACK')
    // provenance link text stripped
    expect(out).not.toContain('source')
    expect(out).not.toContain('ref')
    // no comment markers
    expect(out).not.toContain('〔')
  })

  it('orders lines top-to-bottom with a blank line before the panel', () => {
    const out = serializeScript(DRAFT)
    expect(out).toBe(
      [
        '## Page 13',
        '',
        '**Panel 1**',
        'Art: Eden Gardens at dusk.',
        'CAPTION (Little Chanakya): The first ODI was a circus.',
        'VIRAT: I was relieved.',
        'SFX: KRAAACK',
      ].join('\n'),
    )
  })
})

describe('serializeScriptWithComments', () => {
  const anchored: Thread = {
    root: node({
      id: 't1', category: 'fact', status: 'open', authorName: 'Ankit',
      body: 'The crowd detail is off.',
      anchors: [anchor({ ref: 'p13.pl1.art' }), anchor({ ref: 'p13.pl1.b1', snapshot: '' })],
    }),
    replies: [
      node({ id: 'r1', parentId: 't1', anchors: [], authorName: 'Adnan / Studio Whence', body: 'Fixed in v2.', createdAt: 2000 }),
    ],
  }
  const general: Thread = {
    root: node({ id: 'g1', category: 'missing', status: 'open', authorName: 'Ankit', anchors: [], body: 'Add a closing page.' }),
    replies: [],
  }

  it('marks the anchored art AND caption lines with 〔C1〕, leaves others unmarked', () => {
    const out = serializeScriptWithComments(DRAFT, [anchored, general])
    const lines = out.split('\n')
    const art = lines.find((l) => l.startsWith('Art:'))!
    const cap = lines.find((l) => l.startsWith('CAPTION'))!
    const dia = lines.find((l) => l.startsWith('VIRAT:'))!
    const sfx = lines.find((l) => l.startsWith('SFX:'))!
    expect(art).toContain('〔C1〕')
    expect(cap).toContain('〔C1〕')
    expect(dia).not.toContain('〔')
    expect(sfx).not.toContain('〔')
  })

  it('emits the COMMENTS appendix with category/status/locations, author, reply and a general entry', () => {
    const out = serializeScriptWithComments(DRAFT, [anchored, general], { title: 'Virat' })
    expect(out).toContain('# Virat   (script + editorial comments)')
    expect(out).toContain('> Comments are marked 〔C#〕')
    expect(out).toContain('─── COMMENTS ───')
    expect(out).toContain('〔C1〕  FACT · OPEN · anchored: Page 13 Panel 1 (Art) + Page 13 Panel 1 (caption=beat)')
    expect(out).toContain('   Ankit: The crowd detail is off.')
    expect(out).toContain('   → Adnan / Studio Whence: Fixed in v2.')
    expect(out).toContain('〔G1〕  MISSING/ENRICHMENT · OPEN · whole comic')
    expect(out).toContain('   Ankit: Add a closing page.')
  })

  it('skips hidden threads entirely', () => {
    const hidden: Thread = { root: node({ id: 'h1', hidden: true, anchors: [anchor({})], body: 'hidden note' }), replies: [] }
    const out = serializeScriptWithComments(DRAFT, [hidden])
    expect(out).not.toContain('hidden note')
    expect(out).not.toContain('〔C1〕')
  })

  it('lists an orphan-anchored thread in the appendix but adds no inline marker', () => {
    const orphan: Thread = {
      root: node({ id: 'o1', category: 'tone', status: 'open', authorName: 'Ankit', body: 'orphan',
        anchors: [anchor({ kind: 'page', ref: 'p99', page: 99, panel: undefined, snapshot: 'Page 99' })] }),
      replies: [],
    }
    const out = serializeScriptWithComments(DRAFT, [orphan])
    expect(out).toContain('〔C1〕  TONE/VOICE · OPEN · anchored: Page 99')
    expect(out).toContain('   Ankit: orphan')
    // no inline marker anywhere in the body
    const body = out.split('─── COMMENTS ───')[0]
    expect(body).not.toContain('〔C1〕')
  })

  it('excludes a draft thread by default and includes it with { includeDrafts: true }', () => {
    const draft: Thread = {
      root: node({ id: 'd1', published: false, anchors: [], body: 'draft note' }),
      replies: [],
    }
    // Default: drafts are excluded.
    const out = serializeScriptWithComments(DRAFT, [draft])
    expect(out).not.toContain('draft note')
    // With includeDrafts the draft is serialized.
    const withDrafts = serializeScriptWithComments(DRAFT, [draft], { includeDrafts: true })
    expect(withDrafts).toContain('draft note')
  })

  it('orders anchored markers top-to-bottom by document position', () => {
    // A thread anchored to the SFX (later) should still get C1 if it is the
    // only anchored thread; with two, the earlier-anchored gets C1.
    const onCaption: Thread = { root: node({ id: 'a', anchors: [anchor({ ref: 'p13.pl1.b1' })], body: 'cap' }), replies: [] }
    const onArt: Thread = { root: node({ id: 'b', anchors: [anchor({ ref: 'p13.pl1.art' })], body: 'art', createdAt: 500 }), replies: [] }
    const out = serializeScriptWithComments(DRAFT, [onCaption, onArt])
    const lines = out.split('\n')
    const art = lines.find((l) => l.startsWith('Art:'))!
    const cap = lines.find((l) => l.startsWith('CAPTION'))!
    expect(art).toContain('〔C1〕') // art is earlier in the document
    expect(cap).toContain('〔C2〕')
  })
})

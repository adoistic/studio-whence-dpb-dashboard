/**
 * A fake, fully produced comic for the "Download all" tests. OBVIOUSLY FAKE: this repo is
 * public and carries code only.
 */
import type { Comic, CoverChoice, Figure, ResearchSource } from '@/types/content'
import type { CastDoc } from '@/lib/castModel'
import type { Thread } from '@/lib/feedbackTypes'

export const A = 'artifacts/comics/alpha/01-the-long-road'
export const I = 'images/comics/alpha/01-the-long-road'

export function fullComic(over: Partial<Comic> = {}): Comic {
  return {
    title: 'Sample Hero — The Long Road',
    subject: 'Sample Hero',
    line: 'alpha',
    series: 'Sample Series',
    comic_number: 1,
    status: 'published',
    slug: '01-the-long-road',
    subject_slug: 'sample-hero',
    target_length_pages: 4,
    version: 9,
    updated: '2026-09-28',
    artVersion: 4,
    artUpdated: '2026-09-29',
    changelog: [{ date: '2026-09-28', note: 'Second pass on page two.' }, '2026-09-01 — First draft.'],
    artChangelog: [{ date: '2026-09-29', note: 'Page 3 redrawn.' }],
    corrections: {
      items: [{ id: 'R1-01', source: 'register', page: 2, summary: 'Spell the town right.', state: 'applied', done: '2026-09-20' }],
      counts: { applied: 1, raisedWithDiamond: 0, needsDecision: 0 },
      total: 1,
    },
    originalLanguage: 'en',
    draftKey: 'drafts/alpha/01-the-long-road.html',
    languages: [
      { code: 'en', label: 'English', draftKey: 'drafts/alpha/01-the-long-road.html', isOriginal: true },
      { code: 'hi', label: 'हिंदी', draftKey: 'drafts/alpha/01-the-long-road.hi.html', isOriginal: false },
    ],
    pages: { hasPages: true, count: 4, coverKey: `${I}/cover.jpg`, covers: [{ lang: 'hi', key: `${I}/cover-hi.jpg` }] },
    insideCovers: {
      language: 'English',
      images: [
        { key: `${A}/inside-covers/inside-front-cover.png`, label: 'Inside front cover — the file, part one' },
        { key: `${A}/inside-covers/inside-back-cover.png`, label: 'Inside back cover — the file, part two' },
        { key: `${A}/inside-covers/inside-front-cover-hi.png`, label: 'Hindi edition — inside front cover' },
      ],
    },
    cmykPdf: { key: `${A}/cmyk.pdf`, bytes: 300_000_000, filename: 'x.pdf' },
    editablePpt: { key: `${A}/01-the-long-road-editable.pptx`, bytes: 28_000_000, filename: 'x.pptx' },
    indesign: {
      key: `${A}/01-the-long-road-indesign.zip`, bytes: 42_000_000, filename: 'x.zip',
      deckKey: `${A}/01-the-long-road-editable.pptx`, deckBytes: 28_000_000,
      trims: {
        '450x648': { key: `${A}/en-trim.zip`, bytes: 41_000_000, label: '6.25 × 9 in', width: 6.25, height: 9,
          deckKey: `${A}/01-the-long-road-editable.pptx`, deckBytes: 28_000_000 },
      },
    },
    indesignAll: {
      key: `${A}/all.zip`, bytes: 43_000_000, filename: 'all.zip', languages: ['English', 'Hindi'],
      decks: [{ key: 'd1', bytes: 1 }, { key: 'd2', bytes: 2 }],
      trims: {
        // Built from an older deck: must NOT be offered.
        '450x648': { key: `${A}/all-trim-stale.zip`, bytes: 40_000_000, label: '6.25 × 9 in', decks: [{ key: 'd1', bytes: 9 }] },
      },
    },
    deckPdf: { editions: [
      { language: 'Hindi', key: `${A}/editable-hi.pdf`, bytes: 31_000_000 },
      { language: 'English', key: `${A}/editable-en.pdf`, bytes: 30_000_000 },
    ] },
    translations: [{
      language: 'Hindi',
      script: { key: 'docs/comics/alpha/sample-hero/01-the-long-road/script-hi.md', bytes: 50_000 },
      editablePpt: { key: `${A}/01-the-long-road-editable-hi.pptx`, bytes: 28_500_000, filename: 'y.pptx' },
      indesign: { key: `${A}/hi.zip`, bytes: 42_400_000, filename: 'hi.zip' },
      blank: { key: `${A}/blank-hi.pdf`, bytes: 9_000_000, filename: 'b.pdf' },
    }],
    scriptExports: { layout: 'panel', docxKey: `${A}/script-exports/panels.docx`, pdfKey: `${A}/script-exports/panels.pdf` },
    docs: {
      generatedAt: '2026-10-13',
      bundleKey: 'docs/comics/alpha/sample-hero/01-the-long-road/bundle.md', bundleBytes: 100_000,
      zipKey: 'docs/comics/alpha/sample-hero/01-the-long-road/pack.zip', zipBytes: 30_000,
      items: [
        { type: 'concept-note', label: 'Concept note', readKey: 'r1', downloadKey: 'docs/c/concept-note.md', bytes: 6_000 },
        { type: 'sources-and-quotes', label: 'Sources & quotes', readKey: 'r2', downloadKey: 'docs/c/sources.md', bytes: 31_000 },
        { type: 'script', label: 'Script', readKey: 'r3', downloadKey: 'docs/c/script.ai.md', bytes: 62_000 },
      ],
    },
    coverOptions: { language: 'en', options: [
      { key: `${A}/cover-options/opt2-en.jpg`, label: 'Option 2 — A boy at the gate' },
      { key: `${A}/cover-options/opt2-en-clean.jpg`, label: 'Option 2 — A boy at the gate — clean plate (no titling)' },
      { key: `${A}/cover-options/opt3-en.jpg`, label: 'Option 3 — The long road' },
      { lang: 'hi', key: `${A}/cover-options/opt2-hi.jpg`, label: 'Option 2 — A boy at the gate — Hindi' },
    ] },
    backCover: { language: 'en', image: { key: `${A}/back-cover/back-cover.png`, label: 'Back cover — About the Book' } },
    activities: { language: 'en', pages: [
      { key: `${A}/activities/activity-01.png`, label: 'Story quiz' },
      { key: `${A}/activities/activity-02.png`, label: 'Words to know' },
    ] },
    aboutTheBook: {
      language: 'en',
      backCover: ['A boy walks a long road.', 'He keeps walking.'],
      segments: [{ audience: 'kid', label: 'For young readers', pointers: ['Walk with him.'] }],
    },
    amazonModules: { groups: [{ title: 'Amazon A+ content', images: [{ key: `${A}/amazon-modules/banner.jpg`, label: 'Banner', bytes: 500_000, filename: 'banner.jpg' }] }] },
    ...over,
  }
}

export function cast(): CastDoc {
  return {
    comicId: 'alpha__01-the-long-road', line: 'alpha', slug: '01-the-long-road', title: 'Sample Hero — The Long Road',
    subject_slug: 'sample-hero', program_slug: 'p', library: false, source: 't',
    counts: { characters: 2, named: 2, generalized: 0, shared: 0, drawn: 1, undrawn: 1, versions: 3, versionsDrawn: 2 },
    people: [
      { id: 'hero', line: 'alpha', name: 'Sample Hero', kind: 'named', role: 'The boy on the road.', pages: [1, 2, 3], spoken: 12,
        versions: [
          { stage: 'boy', label: 'Boy', drawn: true, key: 'artifacts/characters/alpha/hero/boy.png', print: 'p/boy.jpg', bytes: 3_000_000, printBytes: 150_000, pages: [1, 2] },
          { stage: 'man', label: 'Man', drawn: true, key: 'artifacts/characters/alpha/hero/man.png', bytes: 3_100_000, pages: [3] },
        ] },
      { id: 'teacher', line: 'alpha', name: 'A Teacher', kind: 'named', pages: [2], spoken: 2,
        versions: [{ stage: 'base', label: 'Main look', drawn: false, pages: [2] }] },
    ],
  }
}

export function figure(): { figure: Figure; sources: ResearchSource[] } {
  const sources: ResearchSource[] = [
    { slug: 'a-book', kind: 'book', title: 'Source · A Long Book', words: 90_000, files: [{ path: 'p/1.md', title: 'One' }, { path: 'p/2.md', title: 'Two' }],
      bundle: { files: 2, md: { key: 'bundles/research/alpha/sample-hero/sources/a-book.md', bytes: 500_000 },
        pdf: { key: 'bundles/research/alpha/sample-hero/sources/a-book.pdf', bytes: 2_000_000 } } },
    // Changed since its bundle was built: text assembled in the browser, no PDF.
    { slug: 'a-talk', kind: 'transcript', title: 'A Talk', words: 4_000, files: [{ path: 'p/t1.md', title: 'Talk' }, { path: 'p/t2.md', title: 'Q&A' }],
      bundle: { files: 1, md: { key: 'bundles/x.md', bytes: 9 }, pdf: { key: 'bundles/x.pdf', bytes: 9 } } },
  ]
  return { figure: { series: 's', slug: 'sample-hero', sources_count: 2, words: 94_000 }, sources }
}

export const threads: Thread[] = [
  {
    root: {
      id: 't1', comicId: 'alpha__01-the-long-road', line: 'alpha', parentId: null,
      anchors: [{ kind: 'beat', ref: 'p2.pl1.b1', page: 2, panel: 1, snapshot: 'He keeps walking.' }],
      authorEmail: 'a@example.test', authorName: 'An Editor', authorRole: 'member', body: 'Is this the right town?',
      status: 'open', category: 'fact', lang: 'en', comicVersion: 9, hidden: false, published: true, createdAt: '2026-09-10T10:00:00Z',
    },
    replies: [{
      id: 'r1', comicId: 'alpha__01-the-long-road', line: 'alpha', parentId: 't1', anchors: [],
      authorEmail: 'b@example.test', authorName: 'The Writer', authorRole: 'admin', body: 'Fixed in v9.',
      comicVersion: 9, hidden: false, published: true, createdAt: '2026-09-11T10:00:00Z',
    }],
  },
  {
    root: {
      id: 't2', comicId: 'alpha__01-the-long-road', line: 'alpha', parentId: null, anchors: [],
      authorEmail: 'c@example.test', authorName: 'A Reviewer', authorRole: 'member', body: 'Lovely book overall.',
      status: 'resolved', category: 'other', lang: 'hi', comicVersion: 9, hidden: false, published: false, createdAt: '2026-09-12T10:00:00Z',
    },
    replies: [],
  },
]

export const choices: Record<string, CoverChoice> = {
  en: { source: 'option', key: `${A}/cover-options/opt3-en.jpg`, label: 'Option 3 — The long road', setByEmail: 'x@example.test', setByName: 'An Art Director', setAt: null },
}

export const ROOT = 'Sample Hero — The Long Road'

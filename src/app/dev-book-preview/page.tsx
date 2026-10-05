'use client'

/**
 * DEV-ONLY visual harness for the book page (the Books surface).
 *
 * A real book sits behind sign-in and its text is gated, so layout QA would need
 * a session. This route renders the same BookDocument from OBVIOUSLY FAKE fixture
 * text (this repo is public and carries code only). In a production build it
 * renders nothing.
 */

import { BookDocument } from '@/components/books/BookPageShell'
import type { BookModel } from '@/lib/books'
import type { Thread } from '@/lib/feedbackTypes'
import type { Comic } from '@/types/content'

const para = (c: number, p: number, words: string, cite = true) => ({
  id: `c${c}.p${p}`,
  kind: 'para' as const,
  parts: cite ? [{ t: words }, { cite: p }] : [{ t: words }],
})

const SAMPLE =
  'This is placeholder prose for *layout testing* only. It runs long enough to wrap across several lines ' +
  'so that the measure, the leading and the first-line indent can be judged at a glance, and it carries a ' +
  'source marker at the end the way a real paragraph would.'

const cites = (c: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    n: i + 1, path: `sample/source-${c}.md`, key: `research/sample/source-${c}.md`,
    line: 10 + i, lines: [10 + i], figure: null, label: `source: sample ${c}, line ${10 + i}`,
  }))

const model: BookModel = {
  schemaVersion: 1, line: 'books-sample', slug: 'sample-book', title: 'Sample Book Title',
  subtitle: 'A subtitle for layout testing', shelf: 'nonfiction', status: 'draft',
  logline: 'A one-sentence placeholder logline that sits above the first chapter.',
  updated: '2026-01-01', language: 'en', words: 1234,
  chapters: [1, 2, 3].map((c) => ({
    n: c, id: `c${c}`, title: `Placeholder chapter ${c}`, words: 400, cites: cites(c, 6),
    blocks: [
      ...(c === 1 ? [{ id: 'c1.e1', kind: 'epigraph' as const, parts: [{ t: 'An italic placeholder epigraph.' }] }] : []),
      para(c, 1, SAMPLE), para(c, 2, SAMPLE), para(c, 3, SAMPLE, false),
      { kind: 'break' as const },
      para(c, 4, SAMPLE), para(c, 5, SAMPLE), para(c, 6, SAMPLE),
    ],
  })),
}

const node = (id: string, over: Partial<Thread['root']>): Thread['root'] => ({
  id, comicId: 'books-sample__sample-book', line: 'books-sample', parentId: null, anchors: [],
  authorEmail: 'editor@example.com', authorName: 'Sample Editor', authorRole: 'allow',
  body: 'A placeholder comment.', status: 'open', category: 'clarity', comicVersion: 1,
  hidden: false, published: true, createdAt: '2026-01-01T00:00:00Z', lang: 'en', langScope: 'en', ...over,
})

const threads: Thread[] = [
  {
    root: node('t1', {
      anchors: [{ kind: 'passage', ref: 'c1.p2', page: 1, chapter: 1, para: 2, quote: 'the measure, the leading', snapshot: SAMPLE }],
      body: 'Could this be shorter?',
      suggestion: { from: 'the measure, the leading', to: 'the line length and spacing' },
    }),
    replies: [node('t1r', { parentId: 't1', body: 'Agreed, applied in the next draft.', authorName: 'Sample Author' })],
  },
  {
    root: node('t2', {
      anchors: [{ kind: 'passage', ref: 'c2.p4', page: 2, chapter: 2, para: 4, quote: 'words that are no longer there', snapshot: SAMPLE }],
      body: 'A comment whose words were later edited away.', category: 'fact',
    }),
    replies: [],
  },
]

const comic = {
  title: model.title, line: model.line, slug: model.slug, status: 'draft', format: 'prose', version: 3,
  series: 'sample-shelf', subject_slug: null,
  downloads: { pdf: { key: 'artifacts/comics/books-sample/sample-book/book/sample.pdf', bytes: 535000 },
               docx: { key: 'artifacts/comics/books-sample/sample-book/book/sample.docx', bytes: 302000 } },
} as unknown as Comic

export default function DevBookPreview() {
  if (process.env.NODE_ENV === 'production') return null
  return (
    <BookDocument
      comic={comic}
      model={model}
      threads={threads}
      canMod
      author={{ email: 'dev@example.com', name: 'Dev', role: 'admin' }}
    />
  )
}

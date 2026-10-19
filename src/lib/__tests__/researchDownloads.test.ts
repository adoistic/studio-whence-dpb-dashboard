/**
 * researchDownloads — the shapes of the research downloads, and when a pre-built
 * bundle may be trusted.
 */
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/dataApi', () => ({ resolveUrls: async () => ({}) }))

import type { Figure, ResearchSource } from '@/types/content'
import {
  figureZipIsCurrent,
  figureZipItems,
  fileDownloadName,
  numberedFileNames,
  researchKeyOf,
  sourceTitle,
  sourceBundleIsCurrent,
  sourceMarkdown,
  sourceZipItems,
} from '@/lib/researchDownloads'

const book: ResearchSource = {
  slug: 'polyester-prince', kind: 'book', title: 'The Polyester Prince', words: 1200,
  files: [
    { path: 'biographies/01-x/_books/dhirubhai/polyester-prince/book.md', title: 'Chapter map' },
    { path: 'biographies/01-x/_books/dhirubhai/polyester-prince/chapters/01-intro.md', title: 'Intro' },
    { path: 'biographies/01-x/_books/dhirubhai/polyester-prince/chapters/02-aden.md', title: 'Aden: the years abroad' },
  ],
}
const talk: ResearchSource = {
  slug: 'ani-45', kind: 'transcript', title: 'ANI Podcast Ep 45', words: 300,
  files: [{ path: 'docs/research/medicomics/x/transcript.md', title: 'Transcript' }],
}
const figure = { slug: 'dhirubhai-ambani', series: 'x', sources_count: 2, words: 1500 } as Figure

describe('keys and names', () => {
  test('a repo path is served under research/, a full key verbatim', () => {
    expect(researchKeyOf('biographies/a.md')).toBe('research/biographies/a.md')
    expect(researchKeyOf('docs/research/medicomics/a.md')).toBe('docs/research/medicomics/a.md')
  })

  test('files are numbered so every file browser keeps the reading order', () => {
    expect(numberedFileNames(book)).toEqual(['01 Chapter map.md', '02 Intro.md', '03 Aden the years abroad.md'])
  })

  test("the index's 'Source · ' label is not part of a file name", () => {
    expect(sourceTitle({ slug: 's', title: 'Source · Make Something Wonderful' })).toBe('Make Something Wonderful')
    expect(sourceTitle({ slug: 's', title: 'Source — Talk' })).toBe('Talk')
    expect(sourceTitle({ slug: 'only-slug', title: 'Source · ' })).toBe('Source · ')
    expect(fileDownloadName({ ...book, title: 'Source · The Polyester Prince' }, 1)).toBe('The Polyester Prince — Intro.md')
  })

  test('a one-file source downloads under the source title', () => {
    expect(fileDownloadName(talk, 0)).toBe('ANI Podcast Ep 45.md')
    expect(fileDownloadName(book, 1)).toBe('The Polyester Prince — Intro.md')
  })
})

describe('shapes', () => {
  test('the single-file form lists the contents, then every file verbatim in order', () => {
    const md = sourceMarkdown(book, 'Dhirubhai Ambani', ['# Map', '# Intro text', null], '2026-10-19')
    expect(md.startsWith('# The Polyester Prince\n')).toBe(true)
    expect(md).toContain('Book · 1,200 words · 3 files · Dhirubhai Ambani')
    expect(md).toContain('1. Chapter map\n2. Intro\n3. Aden: the years abroad')
    expect(md.indexOf('# Intro text')).toBeGreaterThan(md.indexOf('# Map'))
    expect(md).toContain('<!-- source file: biographies/01-x/_books/dhirubhai/polyester-prince/chapters/02-aden.md -->')
    expect(md).toContain('could not be fetched')
  })

  test('a source zip holds one numbered file per chapter', () => {
    expect(sourceZipItems(book).map((i) => i.path)).toEqual(['01 Chapter map.md', '02 Intro.md', '03 Aden the years abroad.md'])
    expect(sourceZipItems(book)[1].key).toBe('research/biographies/01-x/_books/dhirubhai/polyester-prince/chapters/01-intro.md')
  })

  test('everything nests by kind, then source; a one-file source is a file, not a folder', () => {
    const paths = figureZipItems(figure, [book, talk]).map((i) => i.path)
    expect(paths).toEqual([
      'Dhirubhai Ambani — research/Transcripts/ANI Podcast Ep 45.md',
      'Dhirubhai Ambani — research/Books/The Polyester Prince/01 Chapter map.md',
      'Dhirubhai Ambani — research/Books/The Polyester Prince/02 Intro.md',
      'Dhirubhai Ambani — research/Books/The Polyester Prince/03 Aden the years abroad.md',
    ])
  })
})

describe('freshness', () => {
  test('a source bundle is used only while it lists as many files as the source', () => {
    expect(sourceBundleIsCurrent(book)).toBe(false)
    expect(sourceBundleIsCurrent({ ...book, bundle: { files: 3, md: { key: 'k', bytes: 1 } } })).toBe(true)
    expect(sourceBundleIsCurrent({ ...book, bundle: { files: 2, md: { key: 'k', bytes: 1 } } })).toBe(false)
  })

  test('the subject zip must match both the file count and the source count', () => {
    expect(figureZipIsCurrent({ ...figure, researchZip: { key: 'z', bytes: 9, files: 4, sources: 2 } }, [book, talk])).toBe(true)
    expect(figureZipIsCurrent({ ...figure, researchZip: { key: 'z', bytes: 9, files: 4, sources: 3 } }, [book, talk])).toBe(false)
    expect(figureZipIsCurrent({ ...figure, researchZip: { key: 'z', bytes: 9, files: 3, sources: 2 } }, [book, talk])).toBe(false)
  })
})

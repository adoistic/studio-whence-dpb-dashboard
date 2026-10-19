/**
 * researchDownloads — the shapes of the research downloads, and when a pre-built
 * bundle may be trusted.
 */
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/dataApi', () => ({ resolveUrls: async () => ({}) }))

import type { Figure, ResearchSource } from '@/types/content'
import {
  figurePdf,
  figurePdfName,
  filePdfKey,
  filePdfName,
  sourcePdf,
  sourcePdfName,
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

describe('PDFs', () => {
  const B = 'bundles/research/biographies/dhirubhai-ambani/sources'
  const withPdf: ResearchSource = {
    ...book,
    bundle: { files: 3, filePdfs: 3, pdf: { key: `${B}/polyester-prince.pdf`, bytes: 9, pages: 120, format: 'pdf' } },
  }

  test('a source PDF is offered only while its bundle still describes the source', () => {
    expect(sourcePdf(withPdf)?.key).toBe(`${B}/polyester-prince.pdf`)
    expect(sourcePdf({ ...withPdf, files: withPdf.files.slice(0, 2) })).toBeNull()
    expect(sourcePdf(book)).toBeNull()
  })

  test("a file's PDF sits beside its source's, numbered in reading order", () => {
    expect(filePdfKey(withPdf, 0)).toBe(`${B}/polyester-prince/files/0001.pdf`)
    expect(filePdfKey(withPdf, 2)).toBe(`${B}/polyester-prince/files/0003.pdf`)
    expect(filePdfKey(withPdf, 3)).toBeNull()
    // without a count for every file, no key is guessed
    expect(filePdfKey({ ...withPdf, bundle: { ...withPdf.bundle!, filePdfs: undefined } }, 0)).toBeNull()
  })

  test("a one-file source's PDF is the file's, unless it is a zip of PDFs", () => {
    const t = { ...talk, bundle: { files: 1, pdf: { key: 'bundles/research/m/x/sources/ani-45.pdf', bytes: 5, format: 'pdf' as const } } }
    expect(filePdfKey(t, 0)).toBe('bundles/research/m/x/sources/ani-45.pdf')
    expect(filePdfKey({ ...t, bundle: { ...t.bundle, pdf: { ...t.bundle.pdf, format: 'zip' as const } } }, 0)).toBeNull()
  })

  test('a source too long for one PDF downloads as a zip of PDFs, and its files still have their own', () => {
    const long = { ...withPdf, bundle: { ...withPdf.bundle!, pdf: { key: `${B}/polyester-prince.pdf.zip`, bytes: 9, format: 'zip' as const } } }
    expect(sourcePdfName(long)).toBe('The Polyester Prince (PDF).zip')
    expect(filePdfKey(long, 1)).toBe(`${B}/polyester-prince/files/0002.pdf`)
    expect(sourcePdfName(withPdf)).toBe('The Polyester Prince.pdf')
    expect(filePdfName(withPdf, 1)).toBe('The Polyester Prince — Intro.pdf')
  })

  test('the subject PDF is used while it matches the live source list', () => {
    const f = { ...figure, researchPdf: { key: 'bundles/research/biographies/dhirubhai-ambani/all.pdf', bytes: 1, pages: 300, format: 'pdf' as const, files: 4, sources: 2 } }
    expect(figurePdf(f, [book, talk])?.pages).toBe(300)
    expect(figurePdf(f, [book])).toBeNull()
    expect(figurePdfName(f, f.researchPdf)).toBe('Dhirubhai Ambani — research.pdf')
    expect(figurePdfName(f, { ...f.researchPdf, format: 'zip' })).toBe('Dhirubhai Ambani — research (PDF).zip')
  })
})

/**
 * downloadAll — one comic, every file, in numbered folders a stranger can find their way
 * around, and a README.txt that says what everything is.
 *
 * Fixture data is OBVIOUSLY FAKE: this repo is public and carries code only.
 */
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/dataApi', () => ({ resolveUrls: vi.fn(), readMarkdown: vi.fn() }))

import type { Comic } from '@/types/content'
import {
  asTxt,
  buildBundlePlan,
  bundleReadme,
  commentsText,
  fitPath,
  historyText,
  languageName,
  PATH_MAX,
  titled,
  type BundleGroupId,
  type BundlePlan,
} from '@/lib/downloadAll'

import { A, I, ROOT, choices, cast, figure, fullComic, threads } from '@/lib/__tests__/downloadAll.fixture'

function plan(over: Partial<Comic> = {}): BundlePlan {
  return buildBundlePlan(fullComic(over), { figure: figure(), cast: cast(), threads, coverChoices: choices })
}

const paths = (p: BundlePlan) => p.groups.flatMap((g) => g.items.map((i) => i.path))
const item = (p: BundlePlan, path: string) => p.groups.flatMap((g) => g.items).find((i) => i.path === `${ROOT}/${path}`)

describe('names', () => {
  test('a language code becomes its English name; a name passes through', () => {
    expect(languageName('hi')).toBe('Hindi')
    expect(languageName('en')).toBe('English')
    expect(languageName('Hindi')).toBe('Hindi')
    expect(languageName(undefined)).toBe('English')
  })

  test('a long title is cut so the suffix that tells files apart survives', () => {
    const t = 'A Very Long Title That Goes On and On About the Making of a Book Nobody Expected'
    const full = titled(t, 'full resolution', '.pdf')
    const marked = titled(t, 'low resolution, watermarked', '.pdf')
    expect(full.endsWith(' — full resolution.pdf')).toBe(true)
    expect(marked.endsWith(' — low resolution, watermarked.pdf')).toBe(true)
    expect(full.length).toBeLessThanOrEqual(80)
    expect(marked.length).toBeLessThanOrEqual(80)
    expect(titled('Short', 'script, Hindi', 'docx')).toBe('Short — script, Hindi.docx')
  })

  test('a path over the limit loses the end of its file name, never its extension or folders', () => {
    const long = `Root/01 Comic/${'x'.repeat(300)}.pdf`
    const fitted = fitPath(long)
    expect(fitted.length).toBeLessThanOrEqual(PATH_MAX)
    expect(fitted.startsWith('Root/01 Comic/')).toBe(true)
    expect(fitted.endsWith('….pdf')).toBe(true)
    expect(fitPath('Root/a.pdf')).toBe('Root/a.pdf')
  })
})

describe('buildBundlePlan — a fully produced book', () => {
  const p = plan()

  test('names the zip and its root folder after the book', () => {
    expect(p.root).toBe(ROOT)
    expect(p.zipName).toBe(`${ROOT} — all files.zip`)
  })

  test('lists every group, in folder order', () => {
    expect(p.groups.map((g) => g.id)).toEqual<BundleGroupId[]>([
      'comic', 'editions', 'ppt', 'indesign', 'indesignTrim', 'scripts', 'review',
      'covers', 'marketing', 'characters', 'research', 'history',
    ])
    expect(p.groups.map((g) => g.folder)).toEqual([
      '01 Comic', '02 Language editions', '03 Editable files', '03 Editable files', '03 Editable files',
      '04 Scripts', '04 Scripts', '05 Covers and back matter', '06 Amazon A+', '07 Characters', '08 Research',
      '09 History and comments',
    ])
  })

  test('every path is unique, under the root, and short enough for Windows', () => {
    const all = paths(p)
    expect(new Set(all.map((x) => x.toLowerCase())).size).toBe(all.length)
    for (const x of all) {
      expect(x.startsWith(`${ROOT}/`)).toBe(true)
      expect(x.length).toBeLessThanOrEqual(PATH_MAX + 4)
    }
  })

  test('01 Comic: three PDFs made in the browser, the print file, and every page as an image', () => {
    const full = item(p, `01 Comic/${ROOT} — full resolution.pdf`)!
    expect(full.make).toEqual({ kind: 'comic-pdf', variant: 'full' })
    expect(full.note).toContain('front cover, inside front cover, pages 1 to 4 and inside back cover')
    expect(item(p, `01 Comic/${ROOT} — low resolution.pdf`)!.make).toEqual({ kind: 'comic-pdf', variant: 'low' })
    expect(item(p, `01 Comic/${ROOT} — low resolution, watermarked.pdf`)!.make).toEqual({ kind: 'comic-pdf', variant: 'watermarked' })
    expect(item(p, `01 Comic/${ROOT} — CMYK for print.pdf`)!.key).toBe(`${A}/cmyk.pdf`)
    expect(item(p, '01 Comic/Page images/Front cover.jpg')!.key).toBe(`${I}/cover.jpg`)
    expect(item(p, '01 Comic/Page images/Page 04.jpg')!.key).toBe(`${I}/pages/page-04.jpg`)
    expect(p.groups[0].approx).toBe(true)
  })

  test('02 Language editions: a folder per language with its deck PDF, cover and blank pages', () => {
    expect(item(p, `02 Language editions/Hindi/${ROOT} — Hindi.pdf`)!.key).toBe(`${A}/editable-hi.pdf`)
    expect(item(p, `02 Language editions/English/${ROOT} — English.pdf`)!.bytes).toBe(30_000_000)
    expect(item(p, '02 Language editions/Hindi/Front cover.jpg')!.key).toBe(`${I}/cover-hi.jpg`)
    expect(item(p, '02 Language editions/Hindi/Blank pages (no lettering).pdf')!.key).toBe(`${A}/blank-hi.pdf`)
  })

  test('03 Editable files: a deck and an InDesign package per language, the all-languages file, and only CURRENT trims', () => {
    expect(item(p, `03 Editable files/PowerPoint/${ROOT} — English (editable).pptx`)!.bytes).toBe(28_000_000)
    expect(item(p, `03 Editable files/PowerPoint/${ROOT} — Hindi (editable).pptx`)).toBeDefined()
    expect(item(p, `03 Editable files/InDesign/${ROOT} — English only.zip`)!.key).toBe(`${A}/01-the-long-road-indesign.zip`)
    expect(item(p, `03 Editable files/InDesign/${ROOT} — Hindi only.zip`)!.key).toBe(`${A}/hi.zip`)
    expect(item(p, `03 Editable files/InDesign/${ROOT} — all languages.zip`)!.note).toContain('English and Hindi')
    const trims = p.groups.find((g) => g.id === 'indesignTrim')!.items.map((i) => i.key)
    expect(trims).toEqual([`${A}/en-trim.zip`])
  })

  test('04 Scripts: Word per language (inside covers only on the original), text, panels, client documents', () => {
    expect(item(p, `04 Scripts/${ROOT} — script, English.docx`)!.make).toEqual({
      kind: 'script-docx', lang: 'en', draftKey: 'drafts/alpha/01-the-long-road.html', insideCovers: true,
    })
    expect(item(p, `04 Scripts/${ROOT} — script, Hindi.docx`)!.make).toMatchObject({ lang: 'hi', insideCovers: false })
    expect(item(p, `04 Scripts/${ROOT} — script, English.md`)!.key).toBe('docs/c/script.ai.md')
    expect(item(p, `04 Scripts/${ROOT} — script, Hindi.md`)!.key).toContain('script-hi.md')
    expect(item(p, `04 Scripts/${ROOT} — panel layout.pdf`)!.key).toBe(`${A}/script-exports/panels.pdf`)
    expect(item(p, '04 Scripts/Client documents/Concept note.md')!.key).toBe('docs/c/concept-note.md')
    expect(item(p, '04 Scripts/Client documents/Sources & quotes.md')).toBeDefined()
    expect(item(p, '04 Scripts/Client documents/Script.md')).toBeUndefined()
    expect(item(p, '04 Scripts/Client documents/All client documents in one file.md')!.key).toContain('bundle.md')
    expect(item(p, `04 Scripts/Review copies/${ROOT} — author copy.docx`)!.make).toEqual({ kind: 'review', format: 'author' })
    expect(item(p, `04 Scripts/Review copies/${ROOT} — LLM package.zip`)!.make).toEqual({ kind: 'review', format: 'llm' })
  })

  test('05 Covers: the official pick on top, options per language, clean plates apart, inside and back covers, activities', () => {
    const official = item(p, '05 Covers and back matter/Official cover — English.jpg')!
    expect(official.key).toBe(`${A}/cover-options/opt3-en.jpg`)
    expect(official.note).toContain('An Art Director')
    expect(item(p, '05 Covers and back matter/Cover options/English/01 Option 2 — A boy at the gate.jpg')).toBeDefined()
    expect(item(p, '05 Covers and back matter/Cover options/English/02 Option 3 — The long road.jpg')).toBeDefined()
    expect(item(p, '05 Covers and back matter/Cover options/English/Clean plates (no titling)/01 Option 2 — A boy at the gate.jpg')!.key)
      .toBe(`${A}/cover-options/opt2-en-clean.jpg`)
    expect(item(p, '05 Covers and back matter/Cover options/Hindi/01 Option 2 — A boy at the gate.jpg')).toBeDefined()
    expect(item(p, '05 Covers and back matter/Inside covers/Hindi edition — inside front cover.png')).toBeDefined()
    expect(item(p, '05 Covers and back matter/Back cover/Back cover — About the Book.png')).toBeDefined()
    expect(item(p, '05 Covers and back matter/Activities/02 Words to know.png')).toBeDefined()
    expect(item(p, '05 Covers and back matter/About the book.txt')!.text).toContain('He keeps walking.')
  })

  test('06 Amazon A+ keeps the published groups as folders', () => {
    expect(item(p, '06 Amazon A+/Amazon A+ content/01 Banner.jpg')!.bytes).toBe(500_000)
  })

  test('07 Characters: the cast list names who is not drawn yet; one folder per character', () => {
    expect(item(p, '07 Characters/Sample Hero/Sample Hero — Boy.png')!.key).toBe('artifacts/characters/alpha/hero/boy.png')
    expect(item(p, '07 Characters/Characters — contact sheet.pdf')!.make).toEqual({ kind: 'character-pdf' })
    const list = item(p, '07 Characters/Cast list.txt')!.text!
    expect(list).toContain('Sample Hero/Sample Hero — Man.png')
    expect(list).toContain('Main look: NOT DRAWN YET (page 2)')
  })

  test('08 Research: a current source is its PDF and its text; a changed one is text made here, and a note says so', () => {
    expect(item(p, '08 Research/Books/A Long Book.pdf')!.key).toContain('a-book.pdf')
    expect(item(p, '08 Research/Books/A Long Book.md')!.key).toContain('a-book.md')
    expect(item(p, '08 Research/Transcripts/A Talk.pdf')).toBeUndefined()
    expect(item(p, '08 Research/Transcripts/A Talk.md')!.make).toEqual({ kind: 'research-md', sourceSlug: 'a-talk' })
    expect(p.notes.join(' ')).toContain('1 research source changed after its PDF was typeset')
  })

  test('08 Research: design turnarounds sit with the dossier; the figure\'s own dossier paths are not fetched twice', () => {
    const f = figure()
    f.figure.dossierKey = 'Alpha/characters/hero/character-dossier.md'
    f.figure.variations = [{ label: 'Base', stage: 'base', key: 'images/Alpha/characters/hero/base.jpg', bytes: 2_900_000 }]
    const q = buildBundlePlan(fullComic(), { figure: f })
    const research = q.groups.find((g) => g.id === 'research')!.items
    expect(research.find((i) => i.path === `${ROOT}/08 Research/Design & dossier/Design variations/01 Base.jpg`)!.key)
      .toBe('images/Alpha/characters/hero/base.jpg')
    expect(research.some((i) => i.key === 'Alpha/characters/hero/character-dossier.md')).toBe(false)
  })

  test('09 History and comments are text, written into the zip as they are', () => {
    expect(item(p, '09 History and comments/Version history and corrections.txt')!.text).toContain('Spell the town right.')
    expect(item(p, '09 History and comments/Comments.txt')!.text).toContain('Is this the right town?')
  })

  test('a book with everything has nothing to report as absent', () => {
    expect(p.absent).toEqual([])
  })
})

describe('buildBundlePlan — a book with only a script', () => {
  const bare: Comic = {
    title: 'Only Words', line: 'beta', slug: 'only-words', subject_slug: null, status: 'draft',
    draftKey: 'drafts/beta/only-words.html',
  }
  const p = buildBundlePlan(bare, {})

  test('offers the Word script and the history, nothing it does not have', () => {
    expect(p.groups.map((g) => g.id)).toEqual(['scripts', 'history'])
    expect(paths(p)).toContain('Only Words/04 Scripts/Only Words — script, English.docx')
  })

  test('says what the book does not have yet', () => {
    const absent = p.absent.join('\n')
    expect(absent).toContain('no artwork has been published')
    expect(absent).toContain('PowerPoint')
    expect(absent).toContain('InDesign')
    expect(absent).toContain('Cover options')
    expect(absent).toContain('Character sheets')
    expect(absent).toContain('research library')
  })

  test('a missing draft drops the Word script and is reported', () => {
    const none = buildBundlePlan(bare, { hasDraft: false })
    expect(none.groups.map((g) => g.id)).toEqual(['history'])
    expect(none.absent.join('\n')).toContain('A published script')
  })
})

describe('bundleReadme', () => {
  const p = plan()
  const all = new Set<BundleGroupId>(p.groups.map((g) => g.id))
  const written = Object.fromEntries(paths(p).map((x) => [x, 1_000_000]))
  const readme = (selected = all, failed: string[] = []) =>
    bundleReadme(p, fullComic(), { selected, failed, written, today: '2026-10-21' })

  test('is plain text Notepad reads: a BOM and CRLF line ends', () => {
    const r = readme()
    expect(r.startsWith('﻿')).toBe(true)
    expect(r).toContain('\r\n')
    expect(r.replace(/\r\n/g, '')).not.toContain('\n')
  })

  test('opens with what the book is', () => {
    const r = readme()
    expect(r).toContain('SAMPLE HERO — THE LONG ROAD')
    expect(r).toContain('Series      Sample Series, comic 1')
    expect(r).toContain('Languages   English (original), Hindi')
    expect(r).toContain('Script      version 9, last changed 28 September 2026')
    expect(r).toContain('Downloaded  21 October 2026')
  })

  test('walks the folders in order, each file with its real size and what it is for', () => {
    const r = readme()
    const order = ['01 COMIC', '02 LANGUAGE EDITIONS', '03 EDITABLE FILES', '04 SCRIPTS', '05 COVERS AND BACK MATTER',
      '06 AMAZON A+', '07 CHARACTERS', '08 RESEARCH', '09 HISTORY AND COMMENTS']
    const at = order.map((h) => r.indexOf(`\r\n${h}\r\n`))
    expect(at.every((i) => i > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(r).toContain(`  ${ROOT} — CMYK for print.pdf  (1.0 MB)`)
    expect(r).toContain('  Page images/  (5 files, 5.0 MB)')
    expect(r).toContain('InDesign. InDesign packages')
    // A research source with both forms is one line; a source with only its text is its file.
    expect(r).toContain('  Books/A Long Book.pdf + .md  (2 files, 2.0 MB)')
    expect(r).toContain('  Transcripts/A Talk.md  (1.0 MB)')
    // Each language's edition files sit together, the original first.
    const en = r.indexOf(`English/${ROOT} — English.pdf`)
    const hi = r.indexOf(`Hindi/${ROOT} — Hindi.pdf`)
    const hiCover = r.indexOf('Hindi/Front cover.jpg')
    expect(en).toBeGreaterThan(0)
    expect(en).toBeLessThan(hi)
    expect(hi).toBeLessThan(hiCover)
  })

  test('says what was left out, what the book lacks, and what did not arrive', () => {
    const some = new Set<BundleGroupId>([...all].filter((g) => g !== 'indesignTrim'))
    const failedPath = `${ROOT}/01 Comic/Page images/Page 02.jpg`
    const r = readme(some, [failedPath])
    expect(r).toContain('Left out when this was downloaded:')
    expect(r).toContain('InDesign at 6.25 × 9 in (03 Editable files): 1 file, 41 MB')
    expect(r).toContain('COULD NOT BE FETCHED')
    expect(r).toContain('  - 01 Comic/Page images/Page 02.jpg')
    expect(r).toContain('Page images/  (5 files, 4.0 MB; 1 could not be fetched)')
    expect(r).toContain('research source changed after its PDF was typeset')
  })
})

describe('the text files', () => {
  test('comments are grouped by page, with status, kind, language, drafts flagged and replies', () => {
    const t = commentsText(fullComic(), threads)
    expect(t).toContain('PAGE 2')
    expect(t).toContain('[Open] Fact · page 2, panel 1 · English')
    expect(t).toContain('On: "He keeps walking."')
    expect(t).toContain('↳ Reply from The Writer (admin), 11 September 2026: Fixed in v9.')
    expect(t).toContain('NOT TIED TO A PAGE')
    expect(t).toContain('[Resolved] Other · Hindi (draft, not yet published)')
    expect(t.indexOf('PAGE 2')).toBeLessThan(t.indexOf('NOT TIED TO A PAGE'))
  })

  test('history lists both changelogs and the corrections ledger', () => {
    const t = historyText(fullComic())
    expect(t).toContain('Version 9, last changed 28 September 2026.')
    expect(t).toContain('1 September 2026')
    expect(t).toContain('First draft.')
    expect(t).toContain('Page 3 redrawn.')
    expect(t).toContain('[Applied]  page 2  R1-01')
    expect(t).toContain('Done 20 September 2026.')
  })

  test('asTxt never doubles a line end', () => {
    expect(asTxt(['a', 'b\nc'])).toBe('﻿a\r\nb\r\nc\r\n')
  })
})

describe('print version of a black-and-white book', () => {
  const printVersion = {
    label: 'Print version',
    summary: 'Sample summary.',
    press: 'Sample press on sample paper',
    pages: 48,
    files: {
      pdf: { key: `${A}/print-version/sample-print-version.pdf`, bytes: 60_000_000, filename: 'p.pdf' },
      tiff: { key: `${A}/print-version/sample-tiff.zip`, bytes: 60_000_000, filename: 't.zip' },
    },
    testPack: { key: `${A}/print-version/sample-test-sheet.pdf`, bytes: 4_000_000, filename: 's.pdf', pages: [3] },
    compare: { viewPrefix: `${A}/print-version`, versions: [], views: [] },
  }

  test('the print PDF and the test sheet go into 01 Comic; the TIFF zip stays on the page', () => {
    const items = plan({ cmykPdf: undefined, printVersion }).groups.flatMap((g) => g.items)
    const keys = items.map((i) => i.key)
    expect(keys).toContain(printVersion.files.pdf.key)
    expect(keys).toContain(printVersion.testPack.key)
    expect(keys).not.toContain(printVersion.files.tiff.key)
    const pdf = items.find((i) => i.key === printVersion.files.pdf.key)!
    expect(pdf.path).toMatch(/01 Comic\/.*print version, black and white\.pdf$/)
  })

  test('a book with a print version is not reported as missing a CMYK file', () => {
    expect(plan({ cmykPdf: undefined, printVersion }).absent).not.toContain('A CMYK print file.')
  })
})

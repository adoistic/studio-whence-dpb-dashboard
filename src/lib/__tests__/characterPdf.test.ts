// @vitest-environment node
// (pdf-lib and the fetch fixtures need one realm, as a browser has; see downloads.test.ts.)
/**
 * characterPdf — the character contact book: built from the print copies, honest about
 * what is missing, and safe for any name the books use.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest'

const JPEG = Uint8Array.from(Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAADAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCaiiivlT6Y/9k=',
  'base64'))

const resolved: string[][] = []
vi.mock('@/lib/dataApi', () => ({
  resolveUrls: vi.fn(async (keys: string[]) => {
    resolved.push(keys)
    return Object.fromEntries(keys.map((k) => [k, `https://r2.test/${k}`]))
  }),
}))

import { PDFDocument } from 'pdf-lib'
import { mergeCasts, type CastDoc } from '@/lib/castModel'
import { readFileSync } from 'node:fs'
import { buildCharacterPdf, fontText, pdfImageKey, pdfText, wrap } from '@/lib/characterPdf'

const FONTS = (): Promise<[Uint8Array, Uint8Array]> => Promise.resolve([
  new Uint8Array(readFileSync('public/fonts/NotoSans-Regular.subset.ttf')),
  new Uint8Array(readFileSync('public/fonts/NotoSans-Bold.subset.ttf')),
])
const NO_FONTS = () => Promise.resolve(null)

const sheet = (id: string, stage: string, label: string, pages: number[], extra = {}) => ({
  stage, label, drawn: true, pages, bytes: 3_000_000, printBytes: 300_000,
  key: `artifacts/characters/indic/${id}/${stage}.png`,
  thumb: `artifacts/characters/indic/${id}/web/${stage}.jpg`,
  print: `artifacts/characters/indic/${id}/print/${stage}.jpg`,
  ...extra,
})

const CAST: CastDoc = {
  comicId: 'indic__book', line: 'indic', slug: 'book', title: 'Rāmāyaṇa — Book One', subject_slug: '', program_slug: '',
  library: false, source: 't',
  counts: { characters: 0, named: 0, generalized: 0, shared: 0, drawn: 0, undrawn: 0, versions: 0, versionsDrawn: 0 },
  people: [
    { id: 'rama', line: 'indic', name: 'Rāma', kind: 'named', pages: [3], versions: [
      sheet('rama', 'rama', 'Main look', [3, 4], { look: 'Clear cornflower-blue skin, a high black top-knot.' }),
      sheet('rama', 'rama-boy', 'Boy', [5]),
      { stage: 'rama-war', label: 'War', drawn: false, pages: [33] }] },
    { id: 'sita', line: 'indic', name: 'Sītā', kind: 'named', pages: [7], versions: [sheet('sita', 'sita', 'Main look', [7])] },
    { id: 'stock-sage', line: 'indic', name: 'Stock sage', kind: 'generalized', pages: [25], versions: [
      { stage: 'sage', label: 'Sage', drawn: false, text: true, pages: [25] }] },
  ],
}

beforeEach(() => {
  resolved.length = 0
  globalThis.fetch = vi.fn(async (url: string | URL | Request) =>
    String(url).includes('sita') ? new Response('gone', { status: 404 }) : new Response(JPEG)) as typeof fetch
})

describe('text the PDF fonts can set', () => {
  test('diacritics fold and quotes straighten; the em dash stays', () => {
    expect(pdfText('Rāmāyaṇa — Sītā’s “vow”')).toBe('Ramayana — Sita\'s "vow"')
    expect(pdfText('देवनागरी Krishna')).toBe(' Krishna')
  })
  test('wrapping keeps to the width and ends a cut line with an ellipsis', () => {
    const measure = (s: string) => s.length
    expect(wrap('one two three four five', 9, measure)).toEqual(['one two', 'three', 'four five'])
    expect(wrap('one two three four five', 9, measure, 2)).toEqual(['one two', 'three…'])
  })
  test('with the Unicode font, diacritics stay and what the font lacks falls back', () => {
    const t = fontText(new Set([...'Rāmyṇa —Kṣ '].map((c) => c.codePointAt(0)!)))
    expect(t('Rāmāyaṇa — Kṣ')).toBe('Rāmāyaṇa — Kṣ')
    expect(t('Ré\u0301')).toBe('R')           // é is not in this set and neither is e
    expect(t('Ram\tदेव')).toBe('Ram ')
  })
  test('a page embeds the print copy, else the thumbnail, else the sheet', () => {
    expect(pdfImageKey({ print: 'p', thumb: 't', key: 'k' })).toBe('p')
    expect(pdfImageKey({ thumb: 't', key: 'k' })).toBe('t')
    expect(pdfImageKey({ key: 'k' })).toBe('k')
  })
})

describe('buildCharacterPdf', () => {
  test('a cover, a page per sheet from the print copies, and the appendix for the whole work', async () => {
    const all = mergeCasts([CAST])
    const entries = all.flatMap((c) => c.versions.filter((v) => v.drawn).map((version) => ({ character: c, version })))
    const progress: number[] = []
    const bytes = await buildCharacterPdf({ title: 'Rāmāyaṇa', entries, all, onProgress: (p) => progress.push(p.done), loadFonts: NO_FONTS })
    const pdf = await PDFDocument.load(bytes)
    // contents (1) + three sheets + the appendix (1)
    expect(pdf.getPageCount()).toBe(5)
    expect(pdf.getTitle()).toBe('Ramayana — characters')
    expect(resolved.flat().every((k) => k.includes('/print/'))).toBe(true)
    expect(progress.at(-1)).toBe(3)
  })

  test('a selection has no appendix, and a sheet that will not fetch still gets its page', async () => {
    const all = mergeCasts([CAST])
    const sita = all.find((c) => c.id === 'sita')!
    const bytes = await buildCharacterPdf({ title: 'X', entries: [{ character: sita, version: sita.versions[0] }], loadFonts: NO_FONTS })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(2)
  })

  test('set in Noto Sans, the names keep their diacritics', async () => {
    const all = mergeCasts([CAST])
    const entries = all.flatMap((c) => c.versions.filter((v) => v.drawn).map((version) => ({ character: c, version })))
    const bytes = await buildCharacterPdf({ title: 'Rāmāyaṇa — Lakṣmaṇa', entries, all, loadFonts: FONTS })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getTitle()).toBe('Rāmāyaṇa — Lakṣmaṇa — characters')
    expect(pdf.getPageCount()).toBe(5)
  })

  test('fonts that will not load leave Helvetica, folded', async () => {
    const bytes = await buildCharacterPdf({ title: 'Rāmāyaṇa', entries: [], loadFonts: () => Promise.reject(new Error('offline')) })
    expect((await PDFDocument.load(bytes)).getTitle()).toBe('Ramayana — characters')
  })
})

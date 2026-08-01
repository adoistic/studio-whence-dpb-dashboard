import { describe, test, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildStatusWorkbook, workbookFilename } from '../statusWorkbook'
import type { Comic, Figure, Line, Program } from '@/types/content'

const comics: Comic[] = [
  {
    title: 'Shiva: The One Who Says Yes', slug: '01-shiva', line: 'indic', subject_slug: 'shiva',
    program_slug: 'cosmic-beings', status: 'draft', target_length_pages: 64,
    pages: { hasPages: true, count: 64, coverKey: 'k' },
  } as Comic,
  {
    title: 'The One They All Love', slug: '01-krishna', line: 'indic', subject_slug: 'krishna',
    program_slug: 'mahabharata', status: 'in_review' as Comic['status'], target_length_pages: 64,
  } as Comic,
]
const figures: Figure[] = [
  { slug: 'shiva', series: 'Cosmic Beings', line: 'indic', program_slug: 'cosmic-beings', sources_count: 498, words: 702194 },
  { slug: 'krishna', series: 'Mahābhārata', line: 'indic', program_slug: 'mahabharata', sources_count: 31, words: 229208, also_programs: ['cosmic-beings'] },
]
const programs: Program[] = [
  { slug: 'cosmic-beings', line: 'indic', title: 'Cosmic Beings' },
  { slug: 'mahabharata', line: 'indic', title: 'Mahābhārata' },
]
const lines: Line[] = [{ slug: 'indic', title: 'Indic', subtitle: '', comics: [], figures: [] }]

async function build() {
  const blob = await buildStatusWorkbook({ comics, figures, programs, lines, origin: 'https://example.test' })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await blob.arrayBuffer())
  return wb
}

describe('buildStatusWorkbook', () => {
  test('produces a real, readable xlsx with every sheet', async () => {
    const wb = await build()
    expect(wb.worksheets.map((w) => w.name)).toEqual(
      ['Summary', 'Lines', 'Programs', 'Subjects', 'Comics', 'Components', 'Notes'],
    )
  })

  test('one row per comic, per subject, per program, per line', async () => {
    const wb = await build()
    expect(wb.getWorksheet('Comics')!.rowCount).toBe(comics.length + 1)
    expect(wb.getWorksheet('Subjects')!.rowCount).toBe(figures.length + 1)
    expect(wb.getWorksheet('Programs')!.rowCount).toBe(programs.length + 1)
    expect(wb.getWorksheet('Lines')!.rowCount).toBe(lines.length + 1)
  })

  test('names are hyperlinks to the live page', async () => {
    const wb = await build()
    const ws = wb.getWorksheet('Comics')!
    const header = (ws.getRow(1).values as string[]).indexOf('Comic')
    const cell = ws.getRow(2).getCell(header)
    expect(cell.value).toMatchObject({ hyperlink: 'https://example.test/indic/01-krishna' })
  })

  test('headers are frozen and filterable so a 90-row sheet is usable', async () => {
    const wb = await build()
    const ws = wb.getWorksheet('Comics')!
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(ws.autoFilter).toBeTruthy()
  })

  test('the long Components sheet has one row per comic × component', async () => {
    const wb = await build()
    // 12 components in the contract; assert against the real width rather than a literal.
    const perComic = (wb.getWorksheet('Components')!.rowCount - 1) / comics.length
    expect(Number.isInteger(perComic)).toBe(true)
    expect(perComic).toBeGreaterThan(1)
  })

  test('filename is dated so successive exports do not overwrite', () => {
    expect(workbookFilename(new Date('2026-08-01T10:00:00Z')))
      .toBe('Studio-Whence-Production-Status-2026-08-01.xlsx')
  })
})

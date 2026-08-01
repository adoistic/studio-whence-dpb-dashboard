import type { Comic, Figure, Line, Program } from '@/types/content'
import {
  COMPONENTS,
  STATUS_ORDER,
  comicRows,
  componentRows,
  lineRows,
  programRows,
  subjectRows,
  tally,
  type Row,
} from '@/lib/statusRows'

// ─── The in-app "Download Excel" workbook ───────────────────────────────────────
//
// Builds the master production-status workbook from whatever the viewer can
// currently see, in the browser, and hands it back as a Blob. No server, no
// pre-baked file: the download always reflects live state at the moment it is
// clicked.
//
// It is fed by the gated useVisible* hooks, so a member exports exactly their
// own allocation and an admin exports the library. Nothing here widens access.
//
// exceljs is imported dynamically so its weight lands only on the click, never
// in the home page's first load.

const HEAD_FILL = 'FF2E2A4F'
const LINK_COLOR = 'FF1F4E9C'

export interface WorkbookInput {
  comics: Comic[]
  figures: Figure[]
  programs: Program[]
  lines: Line[]
  generatedAt?: string
  /** Absolute site origin, so hyperlinks work from a saved file. */
  origin?: string
}

export function workbookFilename(now = new Date()): string {
  const d = now.toISOString().slice(0, 10)
  return `Studio-Whence-Production-Status-${d}.xlsx`
}

export async function buildStatusWorkbook(input: WorkbookInput): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const origin = input.origin ?? (typeof window !== 'undefined' ? window.location.origin : '')

  const comics = comicRows(input.comics)
  const subjects = subjectRows(input.figures, input.comics)
  const programs = programRows(input.programs, input.comics, input.figures)
  const lines = lineRows(input.lines, input.comics, input.figures, input.programs)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Studio Whence'
  wb.created = new Date()

  // ── Sheet writer ────────────────────────────────────────────────────────────
  const sheet = (name: string, rows: Row[], linkCol: string, widths: Record<string, number> = {}) => {
    const ws = wb.addWorksheet(name)
    if (!rows.length) {
      ws.getCell('A1').value = 'no rows'
      return ws
    }
    const cols = Object.keys(rows[0]).filter((k) => !k.startsWith('_'))
    // Size each column to what is actually in it. Hand-picked widths truncated
    // the very cells that matter — "Diamond Activity Books" rendered as
    // "Diamond Act" in the column that carries the link.
    ws.columns = cols.map((c) => {
      const longest = rows.slice(0, 400)
        .reduce((n, r) => Math.max(n, String(r[c] ?? '').length), 0)
      return { header: c, key: c, width: widths[c] ?? Math.max(11, Math.min(46, Math.max(c.length, longest) + 3)) }
    })
    const head = ws.getRow(1)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } }
    head.alignment = { vertical: 'middle', wrapText: true }
    head.height = 30

    for (const row of rows) {
      const r = ws.addRow(cols.map((c) => row[c] ?? null))
      if (row._href) {
        const cell = r.getCell(cols.indexOf(linkCol) + 1)
        if (cols.includes(linkCol)) {
          cell.value = { text: String(row[linkCol] ?? ''), hyperlink: `${origin}${row._href}` }
          cell.font = { color: { argb: LINK_COLOR }, underline: true }
        }
      }
      for (const pct of ['Pages %', 'Component %']) {
        if (cols.includes(pct)) r.getCell(cols.indexOf(pct) + 1).numFmt = '0%'
      }
      // Thousands separators on the counts that actually get large — an
      // eight-digit word total is unreadable as a bare run of digits.
      for (const n of ['Words', 'Sources', 'Total pages made', 'Files']) {
        if (cols.includes(n)) r.getCell(cols.indexOf(n) + 1).numFmt = '#,##0'
      }
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: cols.length } }
    return ws
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Summary')
  ws.columns = [{ width: 46 }, { width: 18 }, { width: 18 }, { width: 24 }, { width: 20 }, { width: 16 }, { width: 16 }]
  let r = 1
  const put = (col: number, value: string | number) => ws.getCell(r, col).value = value
  const head = (text: string, kicker?: string) => {
    if (kicker) {
      ws.getCell(r, 1).value = kicker
      ws.getCell(r, 1).font = { size: 9, color: { argb: 'FF7A7392' } }
      r += 1
    }
    ws.getCell(r, 1).value = text
    ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: HEAD_FILL } }
    r += 2
  }
  const table = (headers: string[], body: (string | number)[][]) => {
    headers.forEach((h, i) => {
      const c = ws.getCell(r, i + 1)
      c.value = h
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } }
    })
    r += 1
    for (const line of body) {
      line.forEach((v, i) => {
        const c = ws.getCell(r, i + 1)
        c.value = v
        if (typeof v === 'number' && !Number.isInteger(v) && v >= 0 && v <= 1) c.numFmt = '0%'
        else if (typeof v === 'number' && Math.abs(v) >= 10_000) c.numFmt = '#,##0'
      })
      r += 1
    }
    r += 1
  }

  const gen = (input.generatedAt ?? new Date().toISOString()).slice(0, 10)
  head('Studio Whence — master production status',
    `Diamond Pocket Books / Diamond Toons · live state as of ${gen}`)
  put(1, 'Generated from the portal in your browser. Every count below is derivable from the flat '
    + 'sheets by pivot — nothing here is hand-maintained. Names link to the live page.')
  r += 2

  table(['The whole library', 'Count'], [
    ['Lines', lines.length],
    ['Programs (categories)', programs.length],
    ['Subjects / characters', subjects.length],
    ['Comics & books', comics.length],
    ['Comic pages made', comics.reduce((n, c) => n + (c['Pages made'] as number), 0)],
    ['Source slots across subjects', subjects.reduce((n, s) => n + (s.Sources as number), 0)],
    ['Words summed across subjects', subjects.reduce((n, s) => n + (s.Words as number), 0)],
  ])
  put(1, 'One book can be research for many subjects, so the last two rows count a shared source '
    + 'under each subject that uses it. They measure how deeply subjects are backed, not how much '
    + 'distinct material the library holds.')
  ws.getCell(r, 1).font = { size: 9, color: { argb: 'FF7A7392' } }
  r += 2

  head('Subjects — how far each has come', 'The research → script → art pipeline')
  table(['Stage', 'Subjects', 'Share'],
    tally(subjects, (s) => s['Production stage'] as string)
      .map(([k, n]) => [k, n, subjects.length ? n / subjects.length : 0]))

  head('Subjects — depth of research', 'Classified by words held')
  table(['Band', 'Subjects', 'Words'],
    tally(subjects, (s) => s['Research band'] as string).map(([k, n]) => [
      k, n, subjects.filter((s) => s['Research band'] === k).reduce((a, s) => a + (s.Words as number), 0),
    ]))

  head('Comics — editorial status')
  {
    const t = new Map(tally(comics, (c) => c.Status as string))
    table(['Status', 'Comics'], [
      ...STATUS_ORDER.filter((s) => t.get(s)).map((s) => [s, t.get(s)!] as [string, number]),
      ...Array.from(t.entries()).filter(([k]) => !STATUS_ORDER.includes(k)),
    ])
  }

  head('Comics — art progress')
  table(['Page state', 'Comics', 'Share'],
    tally(comics, (c) => c['Page state'] as string)
      .map(([k, n]) => [k, n, comics.length ? n / comics.length : 0]))

  head('Comics — which components exist', 'See the Components sheet for the long form')
  table(['Component', 'Comics with it', 'Share of comics', 'Items across the library'],
    COMPONENTS.map(({ label }) => {
      const withIt = comics.filter((c) => c[label]).length
      return [label, withIt, comics.length ? withIt / comics.length : 0,
        comics.reduce((n, c) => n + (c[label] as number), 0)]
    }))

  head('By line')
  table(['Line', 'Programs', 'Subjects', 'Comics', 'Comics with all pages', 'Pages made', 'Words'],
    lines.map((l) => [l.Line as string, l.Programs as number, l.Subjects as number, l.Comics as number,
      l['Comics with all pages'] as number, l['Total pages made'] as number, l.Words as number]))

  // ── Flat sheets ─────────────────────────────────────────────────────────────
  sheet('Lines', lines, 'Line')
  sheet('Programs', programs, 'Program')
  sheet('Subjects', subjects, 'Subject', { Subject: 30, 'Also in programs': 22 })
  sheet('Comics', comics, 'Comic')
  sheet('Components', componentRows(comics), 'Comic')

  // ── Notes ───────────────────────────────────────────────────────────────────
  const nws = wb.addWorksheet('Notes')
  nws.columns = [{ width: 30 }, { width: 118 }]
  nws.getCell(1, 1).value = 'How to read this workbook'
  nws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: HEAD_FILL } }
  const notes: [string, string][] = [
    ['Source of truth', 'The live portal catalog, read in your browser at the moment you clicked '
      + 'Download. It shows exactly what you can see — an editor exports their own allocation, '
      + 'an admin exports the library.'],
    ['Links', 'Every Comic, Subject, Program and Line name links to its live page. Sign in first; '
      + 'pages are gated.'],
    ['Script', 'A comic exists in the catalog only because a validated script does, so every comic '
      + 'row counts as having a script. For subjects, "Has script" means at least one comic exists.'],
    ['Page state', '0 · No pages — script only. 2 · Some pages — art started. 3 · All pages — the '
      + 'made page count has reached the script target, so the interior is potentially complete. A '
      + 'PUBLISHED book counts as complete whatever the arithmetic says: it has shipped. That '
      + 'matters for the activity books, whose script target counts covers while the published page '
      + 'set is the interior alone, so the two are not measuring the same thing.'],
    ['Potentially complete', 'That the interior is fully drawn. It does not assert editorial '
      + 'approval — read it alongside Status.'],
    ['Components', 'The parts a finished book needs beyond its interior: cover, cover options, '
      + 'inside covers, back cover, activity pages, about-the-book copy, print-ready CMYK PDF, '
      + 'editable deck, translations, retail modules, and the published documents.'],
    ['Component %', 'Components present ÷ components possible. A low share is not a defect — most '
      + 'titles are never meant to carry every component.'],
    ['Research band', 'Subjects classified by words of source material held. Bands come from the '
      + 'real distribution: the median subject holds about 31,000 words while the top tenth clear '
      + 'half a million, so equal-width bands would be useless.'],
    ['Not started', 'A subject scaffolded in the index but never researched still carries a stub of '
      + 'about a hundred words. It counts as research only once it holds a source, or more than a '
      + 'thousand words. Both tests are needed: a few real dossiers are built from reference '
      + 'collections that register no source entry, and they run to hundreds of thousands of words '
      + '— three orders of magnitude clear of any stub.'],
    ['Words', 'One book can be research for many subjects — a single history of the Sikhs is cited '
      + 'under 69 different figures. Each subject’s Words column correctly counts everything '
      + 'backing that subject, so summing the column counts shared books once per subject. Treat it '
      + 'as depth of backing, not as the size of the library.'],
    ['Cross-listing', 'One figure can belong to two programs — their design and primary comic live '
      + 'in one, while another carries a separate, text-faithful dossier of them. "Also in programs" '
      + 'names the others. Program rows count them in both, exactly as the portal does, so program '
      + 'totals can sum to more than the library total.'],
    ['Standalone titles', 'Some books have no research subject. They show as "(standalone title)" '
      + 'and are absent from the Subjects sheet by design.'],
    ['Status spellings', '"in-review" and "in_review" are one stage written two ways in source; '
      + 'both are normalised to "in-review" here.'],
    ['Components sheet', 'Long format — one row per comic × component, with Present as 1/0. Drop it '
      + 'into a pivot table and chart any cut of coverage without writing a formula.'],
  ]
  notes.forEach(([k, v], i) => {
    const row = nws.getRow(i + 3)
    row.getCell(1).value = k
    row.getCell(1).font = { bold: true }
    row.getCell(1).alignment = { vertical: 'top' }
    row.getCell(2).value = v
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    row.height = 15 * (1 + Math.floor(v.length / 110))
  })

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/** Build and save the workbook. Returns the filename written. */
export async function downloadStatusWorkbook(input: WorkbookInput): Promise<string> {
  const blob = await buildStatusWorkbook(input)
  const name = workbookFilename()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has taken the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return name
}

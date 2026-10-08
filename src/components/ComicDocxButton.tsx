'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { insideCoversBlocks, parseDraftHtml } from '@/lib/comicDocx'
import { resolveUrls } from '@/lib/dataApi'

const INK = '1A1A1A'
const ACCENT = '7A2E2E' // terracotta-ish, neutral

/**
 * In-app "Download DOCX" button — builds a Word document CLIENT-SIDE from the
 * rendered draft HTML, mirroring ComicPdfButton's download mechanics. The docx
 * (docx-js) library is lazy-imported INSIDE the click handler so it never lands
 * in the initial bundle / SSR path.
 */
/**
 * The disclaimer printed under the export's metadata. It used to be the health
 * line for every book, so a biography of a cricketer went out saying "not a
 * substitute for professional advice" (Diamond, Sehwag register). Biographies
 * carry the biography disclosure Diamond set for MDH; the medical and awareness
 * lines keep the health wording.
 */
export function disclaimerFor(line: string | undefined): string {
  return line === 'biographies'
    ? 'This educational comic is based on publicly available information, books, interviews and ' +
        'published reporting. It is not an official publication of, or endorsed by, the people or ' +
        'organisations it describes. Some scenes are reconstructed to explain documented events; ' +
        'direct quotations are identified in the source notes.'
    : 'For awareness & education — not a substitute for professional advice.'
}

/**
 * The reader note printed under the metadata: the book's own approved wording when
 * its script carries one (`reader_note:` → `readerNote`), else the line default.
 * Diamond's Djokovic register (SC-09) asked for the approved inside-cover wording in
 * the master Word file too, and flagged the generic line as "a different note".
 */
export function readerNoteFor(comic: Pick<Comic, 'line' | 'readerNote'>): string {
  return comic.readerNote?.trim() || disclaimerFor(comic.line)
}

/**
 * The inside covers, as printed: Diamond reviews this Word file as the master and
 * checks it against the inside covers (SC-16, SC-17, SC-18 on Djokovic; AC-12 on
 * Serena). Fetched from the doc pack's own inside-covers.md, so the two can never
 * say different things. Returns null when the book has none or it cannot be read.
 */
async function fetchInsideCovers(comic: Comic): Promise<string | null> {
  const item = comic.docs?.items.find((i) => i.type === 'inside-covers')
  if (!item) return null
  try {
    const urls = await resolveUrls([item.downloadKey])
    const url = urls[item.downloadKey]
    if (!url) return null
    const res = await fetch(url)
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

/**
 * Build the master Word document for a comic: metadata, reader note, every page with
 * its [src:] provenance, then the inside covers. Pure apart from the lazy docx import,
 * so it can be exercised against a real draft in tests.
 */
export async function buildComicDocument(comic: Comic, draftHtml: string, insideCovers: string | null) {
  // Lazy-import keeps docx-js out of the initial bundle (and off the SSR
  // path) — it loads only when the user clicks.
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  } = await import('docx')

  const { pages } = parseDraftHtml(draftHtml)

  // Section children are a mix of Paragraphs and a Table; the docx
  // FileChild union isn't exported under a stable name, so type the array
  // as the constructed instance types we actually push.
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = []

  // ── Title block ───────────────────────────────────────────────────────
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(comic.title)] }),
  )
  if (comic.logline) {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: comic.logline, italics: true, color: INK })],
      }),
    )
  }

  // ── Metadata table (only present fields) ──────────────────────────────
  const metaRows: [string, string][] = (
    [
      ['Subject', comic.subject],
      ['Series', comic.series],
      ['Comic #', comic.comic_number],
      ['Time span', comic.time_span],
      ['Status', comic.status],
      ['Pages', comic.target_length_pages],
      ['Target age', comic.target_age],
      ['Narrator', comic.narrator],
    ] as [string, string | number | undefined][]
  )
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => [k, String(v)] as [string, string])

  if (metaRows.length > 0) {
    const cell = (txt: string, head: boolean) =>
      new TableCell({
        width: { size: head ? 2600 : 6760, type: WidthType.DXA },
        shading: head ? { fill: 'F0ECE2', type: ShadingType.CLEAR, color: 'auto' } : undefined,
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: txt, bold: head, color: INK })] })],
      })
    children.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2600, 6760],
        rows: metaRows.map(
          ([k, v]) => new TableRow({ children: [cell(k, true), cell(v, false)] }),
        ),
      }),
    )
  }

  // ── Disclaimer line ───────────────────────────────────────────────────
  children.push(
    new Paragraph({
      spacing: { before: 80, after: 40 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 1 } },
      children: [
        new TextRun({
          text: readerNoteFor(comic),
          italics: true,
          size: 18,
          color: '666666',
        }),
      ],
    }),
  )

  // [src: path:line] under the line it supports, as in script.md and the doc pack.
  const srcPara = (srcs: string[] | undefined) =>
    srcs && srcs.length
      ? [
          new Paragraph({
            spacing: { after: 60 },
            indent: { left: 360 },
            children: [
              new TextRun({ text: srcs.map((s) => `[src: ${s}]`).join(' '), size: 16, color: '777777' }),
            ],
          }),
        ]
      : []

  // ── Pages → panels → beats ────────────────────────────────────────────
  pages.forEach((page, pi) => {
    children.push(
      new Paragraph({
        pageBreakBefore: pi > 0,
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(`Page ${page.number}`)],
      }),
    )
    for (const panel of page.panels) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(`Panel ${panel.number}`)] }),
      )
      if (panel.art) {
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'Art.  ', bold: true, color: ACCENT }),
              new TextRun({ text: panel.art, italics: true, color: INK }),
            ],
          }),
        )
        children.push(...srcPara(panel.artSrcs))
      }
      for (const b of panel.beats) {
        if (b.kind === 'caption') {
          children.push(
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({ text: b.speaker ? `Caption — ${b.speaker}.  ` : 'Caption.  ', bold: true, color: INK }),
                new TextRun({ text: b.text, color: INK }),
              ],
            }),
          )
        } else if (b.kind === 'dialogue') {
          children.push(
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({ text: `${b.name}.  `, bold: true, color: ACCENT }),
                new TextRun({ text: b.text, color: INK }),
              ],
            }),
          )
        } else {
          children.push(
            new Paragraph({
              spacing: { after: 60 },
              children: [new TextRun({ text: `SFX:  ${b.text}`, italics: true, color: '555555' })],
            }),
          )
        }
        children.push(...srcPara(b.srcs))
      }
    }
  })

  // ── Inside covers, verbatim from the doc pack ─────────────────────────
  if (insideCovers) {
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun('Inside covers')],
      }),
    )
    for (const blk of insideCoversBlocks(insideCovers)) {
      if (blk.kind === 'heading') {
        children.push(
          new Paragraph({
            heading: blk.level <= 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
            children: [new TextRun(blk.text)],
          }),
        )
      } else if (blk.kind === 'table') {
        const width = 9360
        const cols = Math.max(...blk.rows.map((r) => r.length), 1)
        const colW = Math.floor(width / cols)
        children.push(
          new Table({
            width: { size: width, type: WidthType.DXA },
            columnWidths: Array(cols).fill(colW),
            rows: blk.rows.map(
              (r, ri) =>
                new TableRow({
                  children: Array.from({ length: cols }, (_, ci) =>
                    new TableCell({
                      width: { size: colW, type: WidthType.DXA },
                      shading: ri === 0 ? { fill: 'F0ECE2', type: ShadingType.CLEAR, color: 'auto' } : undefined,
                      margins: { top: 60, bottom: 60, left: 120, right: 120 },
                      children: [new Paragraph({ children: [new TextRun({ text: r[ci] ?? '', bold: ri === 0, color: INK })] })],
                    }),
                  ),
                }),
            ),
          }),
        )
      } else {
        // Printed copy (quotes, bullets, plain paragraphs) in ink; our production
        // notes in small grey italics, so the two read as different things.
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            indent: blk.kind === 'quote' || blk.kind === 'bullet' ? { left: 360 } : undefined,
            children: [
              new TextRun({
                text: (blk.kind === 'bullet' ? '• ' : '') + blk.text,
                color: blk.kind === 'para' && blk.note ? '777777' : INK,
                italics: blk.kind === 'para' && blk.note,
                size: blk.kind === 'para' && blk.note ? 18 : undefined,
              }),
            ],
          }),
        )
      }
    }
  }

  const doc = new Document({
    creator: 'Adnan / Studio Whence',
    title: comic.title,
    styles: {
      default: { document: { run: { font: 'Arial', size: 22, color: INK } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 34, bold: true, font: 'Arial', color: INK },
          paragraph: { spacing: { after: 120 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, font: 'Arial', color: ACCENT },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
        },
        {
          id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 22, bold: true, font: 'Arial', color: '444444' },
          paragraph: { spacing: { before: 140, after: 60 }, outlineLevel: 2 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  })

  return { doc, Packer }
}

export function ComicDocxButton({ comic, draftHtml }: { comic: Comic; draftHtml: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onDownload() {
    setBusy(true)
    setError(null)
    try {
      const insideCovers = await fetchInsideCovers(comic)
      const { doc, Packer } = await buildComicDocument(comic, draftHtml, insideCovers)
      const blob = await Packer.toBlob(doc)
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `${comic.slug}.docx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      console.error('[ComicDocxButton]', err)
      setError('Could not build the DOCX. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full bg-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Building DOCX…' : 'Download DOCX'}
      </button>
      {error && (
        <span role="alert" className="font-sans text-[0.7rem] text-red-700">
          {error}
        </span>
      )}
    </div>
  )
}

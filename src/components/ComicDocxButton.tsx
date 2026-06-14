'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { parseDraftHtml } from '@/lib/comicDocx'

const INK = '1A1A1A'
const ACCENT = '7A2E2E' // terracotta-ish, neutral

/**
 * In-app "Download DOCX" button — builds a Word document CLIENT-SIDE from the
 * rendered draft HTML, mirroring ComicPdfButton's download mechanics. The docx
 * (docx-js) library is lazy-imported INSIDE the click handler so it never lands
 * in the initial bundle / SSR path.
 */
export function ComicDocxButton({ comic, draftHtml }: { comic: Comic; draftHtml: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onDownload() {
    setBusy(true)
    setError(null)
    try {
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
              text: 'For awareness & education — not a substitute for professional advice.',
              italics: true,
              size: 18,
              color: '666666',
            }),
          ],
        }),
      )

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
          }
          for (const b of panel.beats) {
            if (b.kind === 'caption') {
              children.push(
                new Paragraph({
                  spacing: { after: 60 },
                  children: [
                    new TextRun({ text: `Caption — ${b.speaker}.  `, bold: true, color: INK }),
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
          }
        }
      })

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

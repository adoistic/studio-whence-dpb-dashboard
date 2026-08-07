// Blocks → docx. The one docx-js-aware module; lazy-imported by the button.
// Sizing: docx ImageRun transformation is in CSS px (96/inch).
// Portrait A4 content ≈ 6.5in → 624px. Landscape A4 content ≈ 9.7in;
// image column ≈ 4.7in → 451px, text column gets the rest.
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer,
  PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import type { Block, Run } from '@/lib/exportBlocks'
import type { FetchedImage, ImageMap } from '@/lib/exportZip'

const PORTRAIT_IMG_PX = 624
const SIDE_IMG_PX = 451

export function fitImage(natural: { width: number; height: number }, maxWidthPx: number): { width: number; height: number } {
  if (natural.width <= maxWidthPx) return { width: natural.width, height: natural.height }
  const scale = maxWidthPx / natural.width
  return { width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) }
}

function runToText(r: Run): TextRun {
  return new TextRun({ text: r.text, bold: r.bold, italics: r.italics })
}

function imageParagraph(img: FetchedImage | undefined, maxWidthPx: number): Paragraph {
  if (!img) {
    return new Paragraph({ children: [new TextRun({ text: '[image unavailable]', italics: true, color: '999999' })] })
  }
  const { width, height } = fitImage(img, maxWidthPx)
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new ImageRun({ type: 'jpg', data: img.bytes, transformation: { width, height } })],
  })
}

type DocChild = Paragraph | Table

function blockChildren(blocks: Block[], images: ImageMap, imgWidthPx: number): DocChild[] {
  const out: DocChild[] = []
  for (const b of blocks) {
    switch (b.kind) {
      case 'title':
        out.push(
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(b.text)] }),
          new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: b.sub, italics: true, color: '666666' })] }),
        )
        break
      case 'h1':
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: b.pageBreak, children: [new TextRun(b.text)] }))
        break
      case 'h2':
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(b.text)] }))
        break
      case 'image':
        out.push(imageParagraph(images.get(b.ref), imgWidthPx))
        break
      case 'line':
        out.push(new Paragraph({
          spacing: { after: 60 },
          indent: b.indent ? { left: 360 } : undefined,
          children: b.runs.map(runToText),
        }))
        break
      case 'row': {
        const cell = (children: Block[], widthDxa: number, imgPx: number) =>
          new TableCell({
            width: { size: widthDxa, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: blockChildren(children, images, imgPx) as Paragraph[],
          })
        out.push(new Table({
          width: { size: 13400, type: WidthType.DXA },
          columnWidths: [6900, 6500],
          rows: [new TableRow({ children: [cell(b.left, 6900, SIDE_IMG_PX), cell(b.right, 6500, SIDE_IMG_PX)] })],
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
            left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
          },
        }))
        break
      }
    }
  }
  return out
}

export async function assembleDocx(blocks: Block[], images: ImageMap, layout: 'portrait' | 'landscape'): Promise<Uint8Array> {
  const doc = new Document({
    sections: [{
      properties: layout === 'landscape'
        ? { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } }
        : {},
      children: blockChildren(blocks, images, PORTRAIT_IMG_PX),
    }],
  })
  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}

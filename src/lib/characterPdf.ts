'use client'

/**
 * characterPdf.ts — a work's character sheets as one PDF.
 *
 * Adnan, 2026-10-19: "When downloading more than one character, downloading it as a
 * PDF instead of just image zips … I can choose both … the PDF also will be inside
 * the zip. Again, this should also be as optimized."
 *
 * A CONTACT BOOK, not a dump. A cover with the work, its counts and a contents list
 * (character → page); then one page per sheet with the character's name, the version,
 * the books and pages it is staged on and its look; and, when the whole work is asked
 * for, an appendix naming every version nobody has drawn yet and every stock extra
 * that lives in the page text — so the PDF is as honest as the tab.
 *
 * FAST BY CONSTRUCTION. Each page embeds the 1600 px JPEG the publisher makes beside
 * every sheet (`version.print`). pdf-lib wraps a JPEG as it is — no decoding, no
 * re-encoding — so building a 170-page book costs the downloads and little else, and
 * the file is a tenth of the PNG originals. A version published before the print copies
 * existed falls back to its thumbnail, then to the sheet itself.
 *
 * NAMES KEEP THEIR DIACRITICS. The text is set in Noto Sans (two Latin-only subsets of
 * about 95 KB each, `public/fonts/`, OFL), fetched only when a PDF is built, so
 * "Rāmāyaṇa" and "Lakṣmaṇa" print as written (Adnan, 2026-10-19). If the fonts cannot
 * be fetched the PDF is still built, in Helvetica with the diacritics folded.
 */

import { resolveUrls } from '@/lib/dataApi'
import type { WorkCharacter, WorkVersion } from '@/lib/castModel'
import type { PDFFont } from 'pdf-lib'

export interface PdfEntry {
  character: WorkCharacter
  version: WorkVersion
}

export interface PdfProgress {
  done: number
  total: number
}

const PAGE: [number, number] = [842, 595] // A4 landscape, in points
const M = 36

/**
 * Text the PDF's standard fonts can set. They speak WinAnsi only, so diacritics are
 * folded (`Rāmāyaṇa` → `Ramayana`) and anything else outside it becomes a plain
 * equivalent rather than throwing half-way through a book.
 */
export function pdfText(s: string | undefined | null): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–]/g, '-')
    .replace(/[·•]/g, '·')
    .replace(/[^\x20-\x7e -ÿ—…]/g, '')
}

/**
 * Text a Unicode font can set: NFC, and any character the font lacks (Devanagari, an
 * emoji) falls back to its base letter, or drops out, rather than printing a box.
 */
export function fontText(supported: Set<number>): (s: string | undefined | null) => string {
  return (s) => {
    let out = ''
    for (const ch of (s ?? '').normalize('NFC')) {
      const cp = ch.codePointAt(0)!
      if (supported.has(cp)) out += ch
      else if (/\s/.test(ch)) out += ' '
      else {
        const base = ch.normalize('NFD')[0]
        if (base !== ch && supported.has(base.codePointAt(0)!)) out += base
      }
    }
    return out
  }
}

export const FONT_URLS = ['/fonts/NotoSans-Regular.subset.ttf', '/fonts/NotoSans-Bold.subset.ttf'] as const

let fontsPromise: Promise<[Uint8Array, Uint8Array] | null> | null = null

/** The two text fonts, fetched once per session; null if they cannot be had. */
function defaultFonts(): Promise<[Uint8Array, Uint8Array] | null> {
  fontsPromise ??= Promise.all(FONT_URLS.map(async (u) => {
    const res = await fetch(u)
    if (!res.ok) throw new Error(`${u}: ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }))
    .then(([a, b]) => [a, b] as [Uint8Array, Uint8Array])
    .catch(() => { fontsPromise = null; return null })
  return fontsPromise
}

/** Greedy word-wrap to a width, capped at `maxLines` with an ellipsis. */
export function wrap(
  text: string,
  width: number,
  measure: (s: string) => number,
  maxLines = Infinity,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (measure(next) <= width || !cur) cur = next
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    let last = kept[maxLines - 1]
    while (last && measure(`${last}…`) > width) last = last.slice(0, -1)
    kept[maxLines - 1] = `${last}…`
    return kept
  }
  return lines
}

function ranges(pages: number[]): string {
  const s = Array.from(new Set(pages)).sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < s.length; ) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`)
    i = j + 1
  }
  return out.join(', ')
}

function where(v: WorkVersion): string {
  return v.comics
    .filter((a) => a.pages.length)
    .map((a) => `${a.title} p${ranges(a.pages)}`)
    .join('  ·  ')
}

/** The image a page embeds: the print copy, else the thumbnail, else the sheet. */
export function pdfImageKey(v: Pick<WorkVersion, 'print' | 'thumb' | 'key'>): string | undefined {
  return v.print ?? v.thumb ?? v.key
}

async function fetchAll(
  keys: string[],
  onEach: () => void,
  signal?: AbortSignal,
  concurrency = 6,
): Promise<Map<string, Uint8Array>> {
  const unique = Array.from(new Set(keys))
  const urls = unique.length ? await resolveUrls(unique) : {}
  const out = new Map<string, Uint8Array>()
  let next = 0
  async function worker() {
    while (next < unique.length) {
      const k = unique[next++]
      const url = urls[k]
      try {
        if (url) {
          const res = await fetch(url, { signal })
          if (res.ok) out.set(k, new Uint8Array(await res.arrayBuffer()))
        }
      } catch (err) {
        if (signal?.aborted) throw err
      }
      onEach()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker))
  return out
}

const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8
const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50

/**
 * Build the PDF. `all`, when given, is the whole work: its versions still owed and its
 * page-text extras go in an appendix (pass it for "Download all", omit it for a
 * selection, which is about the sheets picked).
 */
export async function buildCharacterPdf(opts: {
  title: string
  entries: PdfEntry[]
  all?: WorkCharacter[]
  onProgress?: (p: PdfProgress) => void
  signal?: AbortSignal
  /** Regular + bold font bytes; defaults to fetching Noto Sans. Null = Helvetica. */
  loadFonts?: () => Promise<[Uint8Array, Uint8Array] | null>
}): Promise<Uint8Array> {
  const { title, entries, all, onProgress, signal, loadFonts = defaultFonts } = opts
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const fontBytes = loadFonts().catch(() => null)
  const total = entries.length
  let done = 0
  onProgress?.({ done, total })
  const bytes = await fetchAll(
    entries.map((e) => pdfImageKey(e.version)).filter((k): k is string => !!k),
    () => { done += 1; onProgress?.({ done: Math.min(done, total), total }) },
    signal,
  )

  const doc = await PDFDocument.create()
  doc.setAuthor('Studio Whence')
  doc.setCreator('Studio Whence portal')
  const faces = await fontBytes
  let font: PDFFont, bold: PDFFont, t: (s: string | undefined | null) => string
  try {
    if (!faces) throw new Error('no fonts')
    const { default: fontkit } = await import('@pdf-lib/fontkit')
    doc.registerFontkit(fontkit)
    font = await doc.embedFont(faces[0])
    bold = await doc.embedFont(faces[1])
    t = fontText(new Set(font.getCharacterSet()))
  } catch {
    font = await doc.embedFont(StandardFonts.Helvetica)
    bold = await doc.embedFont(StandardFonts.HelveticaBold)
    t = pdfText
  }
  doc.setTitle(t(`${title} — characters`))
  const ink = rgb(0.16, 0.14, 0.3)
  const grey = rgb(0.42, 0.42, 0.48)
  const gold = rgb(0.6, 0.47, 0.25)
  const date = new Date().toISOString().slice(0, 10)
  const measure = (f: typeof font, size: number) => (s: string) => f.widthOfTextAtSize(s, size)

  // ── page numbers first, so the contents can name them ──
  const charsInOrder: { name: string; first: number }[] = []
  const firstPageOf = new Map<string, number>()
  const PER_CONTENTS_COL = 34
  const contentsCount = new Set(entries.map((e) => e.character.uid)).size
  const contentsPages = Math.max(1, Math.ceil(contentsCount / (PER_CONTENTS_COL * 2)))
  entries.forEach((e, i) => {
    if (!firstPageOf.has(e.character.uid)) {
      firstPageOf.set(e.character.uid, contentsPages + i + 1)
      charsInOrder.push({ name: e.character.name, first: contentsPages + i + 1 })
    }
  })

  // ── cover + contents ──
  for (let cp = 0; cp < contentsPages; cp++) {
    const page = doc.addPage(PAGE)
    let y = PAGE[1] - M - 10
    if (cp === 0) {
      page.drawText(t(title), { x: M, y: y - 18, size: 30, font: bold, color: ink })
      y -= 46
      page.drawText('CHARACTERS', { x: M, y, size: 11, font, color: gold })
      y -= 18
      const uniq = new Set(entries.map((e) => e.character.uid)).size
      page.drawText(t(`${entries.length} sheets · ${uniq} characters · generated ${date} · Studio Whence`),
        { x: M, y, size: 10, font, color: grey })
      y -= 30
    } else {
      page.drawText('CONTENTS (continued)', { x: M, y: y - 4, size: 11, font, color: gold })
      y -= 30
    }
    const slice = charsInOrder.slice(cp * PER_CONTENTS_COL * 2, (cp + 1) * PER_CONTENTS_COL * 2)
    const colW = (PAGE[0] - 2 * M - 24) / 2
    slice.forEach((c, i) => {
      const col = Math.floor(i / PER_CONTENTS_COL)
      const row = i % PER_CONTENTS_COL
      const x = M + col * (colW + 24)
      const yy = y - row * 13
      const num = String(c.first)
      const nameMax = colW - bold.widthOfTextAtSize(num, 9) - 12
      const [name] = wrap(t(c.name), nameMax, measure(font, 9), 1)
      page.drawText(name, { x, y: yy, size: 9, font, color: ink })
      page.drawText(num, { x: x + colW - font.widthOfTextAtSize(num, 9), y: yy, size: 9, font, color: grey })
    })
  }

  // ── one page per sheet ──
  for (const [i, e] of entries.entries()) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const page = doc.addPage(PAGE)
    const { character: c, version: v } = e
    const top = PAGE[1] - M
    const name = t(c.name)
    page.drawText(name, { x: M, y: top - 18, size: 20, font: bold, color: ink })
    const label = t(v.label).toUpperCase()
    page.drawText(label, { x: M + bold.widthOfTextAtSize(name, 20) + 12, y: top - 16, size: 10, font, color: gold })
    const kind = c.kind === 'generalized' ? 'Generalised' : c.kind === 'shared' ? 'Shared cast' : ''
    const meta = [kind, t(where(v))].filter(Boolean).join('  ·  ')
    const [metaLine] = wrap(meta, PAGE[0] - 2 * M, measure(font, 8.5), 1)
    if (metaLine) page.drawText(metaLine, { x: M, y: top - 34, size: 8.5, font, color: grey })

    const look = v.look ? wrap(t(v.look), PAGE[0] - 2 * M, measure(font, 8.5), 3) : []
    const footY = M - 6
    const imgTop = top - 46
    const imgBottom = footY + 14 + look.length * 11
    const key = pdfImageKey(v)
    const raw = key ? bytes.get(key) : undefined
    let drawn = false
    if (raw) {
      const img = isJpeg(raw) ? await doc.embedJpg(raw).catch(() => null)
        : isPng(raw) ? await doc.embedPng(raw).catch(() => null) : null
      if (img) {
        const boxW = PAGE[0] - 2 * M
        const boxH = imgTop - imgBottom
        const s = Math.min(boxW / img.width, boxH / img.height)
        page.drawImage(img, {
          x: M + (boxW - img.width * s) / 2,
          y: imgBottom + (boxH - img.height * s) / 2,
          width: img.width * s,
          height: img.height * s,
        })
        drawn = true
      }
    }
    if (!drawn) {
      page.drawText('This sheet could not be fetched when the PDF was made.', {
        x: M, y: (imgTop + imgBottom) / 2, size: 12, font, color: grey,
      })
    }
    look.forEach((line, k) => {
      page.drawText(line, { x: M, y: footY + 14 + (look.length - 1 - k) * 11, size: 8.5, font, color: grey })
    })
    const foot = t(`${title} · characters`)
    page.drawText(foot, { x: M, y: footY, size: 7.5, font, color: grey })
    const n = String(contentsPages + i + 1)
    page.drawText(n, { x: PAGE[0] - M - font.widthOfTextAtSize(n, 7.5), y: footY, size: 7.5, font, color: grey })
  }

  // ── appendix: what the work still owes, and what lives in the page text ──
  if (all?.length) {
    const owed: string[] = []
    const text: string[] = []
    for (const c of all) {
      for (const v of c.versions) {
        if (v.drawn) continue
        const line = `${c.name} — ${v.label}${where(v) ? `  (${where(v)})` : ''}`
        ;(v.text ? text : owed).push(t(line))
      }
    }
    const sections: [string, string[]][] = [
      ['NOT DRAWN YET', owed],
      ['DESCRIBED IN THE PAGE TEXT (no sheet needed)', text],
    ]
    let page = doc.addPage(PAGE)
    let y = PAGE[1] - M - 10
    for (const [head, rows] of sections) {
      if (!rows.length) continue
      if (y < M + 60) { page = doc.addPage(PAGE); y = PAGE[1] - M - 10 }
      page.drawText(head, { x: M, y, size: 11, font: bold, color: gold })
      y -= 20
      for (const r of rows) {
        for (const line of wrap(r, PAGE[0] - 2 * M, measure(font, 9), 2)) {
          if (y < M) { page = doc.addPage(PAGE); y = PAGE[1] - M - 10 }
          page.drawText(line, { x: M, y, size: 9, font, color: ink })
          y -= 12
        }
      }
      y -= 14
    }
  }

  return doc.save({ useObjectStreams: true })
}

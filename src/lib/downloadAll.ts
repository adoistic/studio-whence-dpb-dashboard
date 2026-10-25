/**
 * downloadAll.ts — every file of one comic, in one organised zip.
 *
 * Adnan, 21 Oct 2026: "There's a lot of stuff to download … someone might just want them
 * all. Can we have a Download All button which zips everything and organizes everything in
 * a very proper folder/subfolder nested structure … There's also a TXT file which gets
 * exported, which explains everything."
 *
 * PURE: no fetch, no DOM, no Firebase. `buildBundlePlan` lists what the book has, folder by
 * folder — R2 keys to stream, text to write, and the files the browser has to make (the
 * PDFs, the Word scripts, the review copies). `downloadAllRun.ts` turns a plan into a zip.
 * `bundleReadme` writes the README.txt last, so it can say what each file weighed and what
 * did not arrive.
 *
 * The folders are numbered and keep their number in every book's zip: 01 is always the
 * comic, 07 always the characters. Design: the content repo's
 * docs/superpowers/specs/2026-10-21-comic-download-all-design.md.
 */

import type { Comic, CoverChoice, Figure, ResearchSource } from '@/types/content'
import { comicPageKeys, comicPdfKeys } from '@/lib/comicPageKeys'
import { comicLanguages } from '@/lib/comicLanguages'
import { currentTrims, trimLabel, type TrimmedBlock } from '@/lib/indesignTrims'
import { drawnVersions, mergeCasts, castTotals, type CastDoc, type WorkCharacter, type WorkVersion } from '@/lib/castModel'
import {
  kindFolder,
  kindLabel,
  sourceBundleIsCurrent,
  sourcePdf,
  sourceTitle,
} from '@/lib/researchDownloads'
import { formatBytes, safeFilename, uniquePaths, ZIP_FILE_MAX } from '@/lib/downloads'
import {
  anchorLabel,
  CATEGORY_LABELS,
  isDraft,
  nodeLang,
  STATUS_COLOR,
  toMillis,
  type Anchor,
  type Category,
  type Status,
  type Thread,
} from '@/lib/feedbackTypes'

// ─── the shape of a plan ──────────────────────────────────────────────────────

export type BundleGroupId =
  | 'comic'
  | 'editions'
  | 'ppt'
  | 'indesign'
  | 'indesignTrim'
  | 'scripts'
  | 'review'
  | 'covers'
  | 'marketing'
  | 'characters'
  | 'research'
  | 'history'

/** A file the browser has to make; `downloadAllRun.ts` binds each kind to its builder. */
export type BundleMaker =
  | { kind: 'comic-pdf'; variant: 'full' | 'low' | 'watermarked' }
  | { kind: 'script-docx'; lang: string; draftKey: string; insideCovers: boolean }
  | { kind: 'review'; format: 'author' | 'side' | 'llm' }
  | { kind: 'character-pdf' }
  | { kind: 'research-md'; sourceSlug: string }

export interface BundleItem {
  /** Path inside the zip, the root folder included. */
  path: string
  /** An R2 key to stream… */
  key?: string
  /** …text written as it is (already UTF-8 with a BOM and CRLF line ends)… */
  text?: string
  /** …or a file made in the browser while the zip streams. */
  make?: BundleMaker
  /** Bytes: recorded by the catalog, or an estimate when `approx`. */
  bytes: number
  approx?: boolean
  /** One line for the README. Within a `listAs` set only the first item's note is used. */
  note?: string
  /** The README lists the items sharing a label as ONE line ("Page images/ — 49 files"). */
  listAs?: string
}

export interface BundleGroup {
  id: BundleGroupId
  /** The top-level folder, e.g. "01 Comic" (two groups may share one). */
  folder: string
  /** The checkbox label. */
  title: string
  /** What it holds, in a sentence (the panel and the README). */
  blurb: string
  items: BundleItem[]
  bytes: number
  approx: boolean
}

export interface BundleContext {
  /** `figures/{subject}` and its sources, when the viewer may read them. */
  figure?: { figure: Figure; sources: ResearchSource[] } | null
  /** `casts/{line}__{slug}`. */
  cast?: CastDoc | null
  /** The comment threads the viewer can see (already visibility-filtered). */
  threads?: Thread[]
  /** The official cover per language code (`coverChoices`). */
  coverChoices?: Record<string, CoverChoice | null | undefined>
  /** False when the original-language draft is known to be missing. */
  hasDraft?: boolean
}

export interface BundlePlan {
  root: string
  zipName: string
  groups: BundleGroup[]
  /** What this book has none of yet, for the README's last section. */
  absent: string[]
  /** Anything partial worth saying (a research PDF older than its source). */
  notes: string[]
}

// ─── constants ────────────────────────────────────────────────────────────────

export const FOLDERS = {
  comic: '01 Comic',
  editions: '02 Language editions',
  editable: '03 Editable files',
  scripts: '04 Scripts',
  covers: '05 Covers and back matter',
  marketing: '06 Amazon A+',
  characters: '07 Characters',
  research: '08 Research',
  history: '09 History and comments',
} as const

/** The order groups are listed in (and the order of the folders they fill). */
export const GROUP_ORDER: BundleGroupId[] = [
  'comic', 'editions', 'ppt', 'indesign', 'indesignTrim', 'scripts', 'review',
  'covers', 'marketing', 'characters', 'research', 'history',
]

/** Measured averages (R2, 21 Oct 2026, every live comic) for the files the catalog does not size. */
export const EST = {
  pageMaster: 560_000,
  cover: 500_000,
  insideCover: 1_500_000,
  lightPage: 90_000,
  coverOption: 5_000_000,
  backCover: 3_000_000,
  activity: 520_000,
  deckPdf: 60_000_000,
  scriptDocx: 60_000,
  panelDocx: 80_000,
  panelPdf: 1_000_000,
  reviewPerPage: 270_000,
  sheet: 1_600_000,
  sheetPrint: 150_000,
  dossier: 60_000,
  variation: 2_000_000,
  wordBytes: 6.5,
} as const

/** The root folder name stays short: Windows' own unzip refuses a path over 260 characters. */
const ROOT_MAX = 50
/** Every path inside the zip, root included, leaving ~80 characters for where it is unzipped. */
export const PATH_MAX = 180

// ─── names ────────────────────────────────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', hi: 'Hindi', 'hi-latn': 'Hinglish' }

/** An English language name for a file name: `hi` → Hindi; a name passes through. */
export function languageName(codeOrName: string | null | undefined): string {
  const v = (codeOrName ?? '').trim()
  if (!v) return 'English'
  return LANGUAGE_NAMES[v.toLowerCase()] ?? v
}

/** `<title> — <suffix>.<ext>`, the title cut so the suffix always survives. */
export function titled(title: string, suffix: string, ext: string, max = ZIP_FILE_MAX): string {
  const e = ext.startsWith('.') ? ext : `.${ext}`
  const tail = suffix ? ` — ${safeFilename(suffix, '', max)}` : ''
  const room = Math.max(12, max - tail.length - e.length)
  let t = safeFilename(title, 'Comic', 400)
  if (t.length > room) t = `${t.slice(0, room - 1).replace(/[\s.,;:·—–-]+$/u, '')}…`
  return `${t}${tail}${e}`
}

/** Shorten a path's last segment (its extension kept) so the whole path fits `max`. */
export function fitPath(path: string, max = PATH_MAX): string {
  if (path.length <= max) return path
  const slash = path.lastIndexOf('/')
  const dir = path.slice(0, slash + 1)
  const name = path.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot) : ''
  const stem = dot > 0 ? name.slice(0, dot) : name
  const room = max - dir.length - ext.length - 1
  if (room < 8) return path
  return `${dir}${stem.slice(0, room).replace(/[\s.,;:·—–-]+$/u, '')}…${ext}`
}

function extOf(key: string | undefined, fallback = '.png'): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(key ?? '')
  return m ? `.${m[1].toLowerCase()}` : fallback
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** `2026-09-28` → `28 September 2026`; anything else passes through. */
export function longDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return iso ?? ''
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

function isoDay(v: unknown): string {
  const ms = toMillis(v)
  return ms ? new Date(ms).toISOString().slice(0, 10) : ''
}

function statusLabel(status: string | undefined): string {
  if (!status) return ''
  const s = status.replace(/[-_]/g, ' ')
  return s[0].toUpperCase() + s.slice(1)
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs.join('')
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

// ─── plain text, for Notepad as much as anything else ─────────────────────────

/** Wrap prose at `width` columns, every line prefixed with `indent`. */
export function wrap(text: string, width = 78, indent = ''): string[] {
  const words = (text ?? '').split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if (line && indent.length + line.length + 1 + w.length > width) {
      lines.push(indent + line)
      line = w
    } else {
      line = line ? `${line} ${w}` : w
    }
  }
  if (line) lines.push(indent + line)
  return lines
}

/** UTF-8 with a BOM and CRLF line ends, so Notepad shows "—" and Devanagari as written. */
export function asTxt(lines: string[]): string {
  return `﻿${lines.join('\r\n').replace(/\r?\n/g, '\r\n')}\r\n`
}

function heading(text: string, rule = '-'): string[] {
  return [text, rule.repeat(Math.min(78, Math.max(4, text.length)))]
}

// ─── what the book is in ──────────────────────────────────────────────────────

/** Every language the book exists in, original first. */
export function bookLanguages(comic: Comic): string[] {
  const own = languageName(comic.originalLanguage ?? 'en')
  const names = [own]
  const add = (n: string | undefined) => {
    if (!n) return
    const name = languageName(n)
    if (!names.some((x) => x.toLowerCase() === name.toLowerCase())) names.push(name)
  }
  for (const l of comic.languages ?? []) add(l.code)
  for (const t of comic.translations ?? []) add(t.language)
  for (const e of comic.deckPdf?.editions ?? []) add(e.language)
  return names
}

/** A cover option with no titling (published as `optN-clean`), as CoverOptions tells them apart. */
function isBlankPlate(o: { key: string; label: string }): boolean {
  return /-clean\.(png|jpe?g)$/i.test(o.key) || /clean plate|no titling|blank/i.test(o.label)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A cover option's label without what its folder already says (the language, "clean plate"). */
function coverLabel(label: string, language?: string): string {
  let s = label.replace(/\s*[—–-]\s*clean plate\s*(\(no titling\))?/i, '').replace(/\s*\(no titling\)/i, '')
  if (language) s = s.replace(new RegExp(`\\s*[—–-]\\s*${escapeRe(language)}\\s*$`, 'i'), '')
  return s.trim() || label
}

const KIND_ORDER = ['book', 'transcript', 'topic-note', 'character-dossier', 'design-bible', 'characterization']

const DOC_NOTES: Record<string, string> = {
  'concept-note': 'What the book is about, who it is for, and why it is worth making.',
  'sources-and-quotes': 'Every source the book draws on, and every quotation with where it comes from.',
  'inside-covers-printed': 'The words on the inside covers, exactly as printed.',
  'inside-covers': 'The working copy of the inside covers.',
}

const GROUP_TITLES: Record<BundleGroupId, string> = {
  comic: 'The comic',
  editions: 'Language editions',
  ppt: 'PowerPoint (editable)',
  indesign: 'InDesign',
  indesignTrim: 'InDesign at 6.25 × 9 in',
  scripts: 'Scripts and client documents',
  review: 'Review copies with comments',
  covers: 'Covers and back matter',
  marketing: 'Amazon A+ images',
  characters: 'Characters',
  research: 'Research',
  history: 'History and comments',
}

const GROUP_FOLDERS: Record<BundleGroupId, string> = {
  comic: FOLDERS.comic,
  editions: FOLDERS.editions,
  ppt: FOLDERS.editable,
  indesign: FOLDERS.editable,
  indesignTrim: FOLDERS.editable,
  scripts: FOLDERS.scripts,
  review: FOLDERS.scripts,
  covers: FOLDERS.covers,
  marketing: FOLDERS.marketing,
  characters: FOLDERS.characters,
  research: FOLDERS.research,
  history: FOLDERS.history,
}

// ─── the plan ─────────────────────────────────────────────────────────────────

/**
 * Everything one comic has, as groups of files under numbered folders. Only what exists
 * is listed; `absent` says what the book does not have yet. Paths are fitted to
 * `PATH_MAX` and made unique across the whole zip.
 */
export function buildBundlePlan(comic: Comic, ctx: BundleContext = {}): BundlePlan {
  const title = comic.title || comic.slug
  const root = safeFilename(title, comic.slug || 'Comic', ROOT_MAX)
  const original = (comic.originalLanguage ?? 'en').toLowerCase()
  const own = languageName(original)
  const at = (folder: string, rel: string) => `${root}/${folder}/${rel}`
  const absent: string[] = []
  const notes: string[] = []
  const groups: BundleGroup[] = []
  const add = (id: BundleGroupId, items: BundleItem[], blurb: string) => {
    if (items.length === 0) return
    groups.push({
      id,
      folder: GROUP_FOLDERS[id],
      title: GROUP_TITLES[id],
      blurb,
      items,
      bytes: items.reduce((n, i) => n + (i.bytes || 0), 0),
      approx: items.some((i) => i.approx),
    })
  }
  const pages = comic.pages?.hasPages && comic.pages.count > 0 ? comic.pages : null

  // 01 Comic ──────────────────────────────────────────────────────────────────
  {
    const items: BundleItem[] = []
    if (pages) {
      const pageKeys = comicPageKeys(comic)
      const pdfKeys = comicPdfKeys(comic)
      const interior = pageKeys.slice(pages.coverKey ? 1 : 0)
      const first = pdfKeys.indexOf(interior[0])
      const last = pdfKeys.indexOf(interior[interior.length - 1])
      const front = Math.max(0, first - (pages.coverKey ? 1 : 0))
      const back = Math.max(0, pdfKeys.length - 1 - last)
      const order = [
        pages.coverKey ? 'front cover' : null,
        front ? 'inside front cover' : null,
        `pages 1 to ${pages.count}`,
        back ? 'inside back cover' : null,
      ].filter((x): x is string => !!x)
      const fullBytes = pages.count * EST.pageMaster + (pages.coverKey ? EST.cover : 0) + (front + back) * EST.insideCover
      const lightBytes = pdfKeys.length * EST.lightPage
      items.push(
        {
          path: at(FOLDERS.comic, titled(title, 'full resolution', '.pdf')),
          make: { kind: 'comic-pdf', variant: 'full' },
          bytes: fullBytes,
          approx: true,
          note: `The book as printed, at full resolution: ${listWords(order)}.`,
        },
        {
          path: at(FOLDERS.comic, titled(title, 'low resolution', '.pdf')),
          make: { kind: 'comic-pdf', variant: 'low' },
          bytes: lightBytes,
          approx: true,
          note: 'A light copy to read on screen or send by email.',
        },
        {
          path: at(FOLDERS.comic, titled(title, 'low resolution, watermarked', '.pdf')),
          make: { kind: 'comic-pdf', variant: 'watermarked' },
          bytes: lightBytes,
          approx: true,
          note: 'The light copy with © Diamond Toons stamped across every page, safe to circulate.',
        },
      )
    }
    const printPdf = comic.printVersion?.files.pdf
    if (comic.cmykPdf?.key) {
      items.push({
        path: at(FOLDERS.comic, titled(title, 'CMYK for print', '.pdf')),
        key: comic.cmykPdf.key,
        bytes: comic.cmykPdf.bytes || 0,
        note: 'The print file: converted to CMYK for uncoated paper (PSO Uncoated v3, FOGRA52), with text and line art on the black plate only.',
      })
    } else if (!printPdf && pages) {
      absent.push('A CMYK print file.')
    }
    // A black-and-white book's print version (its TIFF pages stay on the comic page: a zip inside a zip).
    if (printPdf?.key) {
      items.push({
        path: at(FOLDERS.comic, titled(title, 'print version, black and white', '.pdf')),
        key: printPdf.key,
        bytes: printPdf.bytes || 0,
        note: `The print file for a one-colour press (${comic.printVersion!.press}). Every page is a 1-bit 600 dpi image at 5 x 7 inches. The same pages as TIFF images are on the comic page.`,
      })
      const pack = comic.printVersion!.testPack
      if (pack?.key) {
        items.push({
          path: at(FOLDERS.comic, titled(title, 'print test sheet', '.pdf')),
          key: pack.key,
          bytes: pack.bytes || 0,
          note: 'The hardest pages as first sent and as the print version, with grey steps from 0 to 100%. Print it on the real press and paper before the run.',
        })
      }
    }
    if (pages) {
      const keys = comicPageKeys(comic)
      const width = Math.max(2, String(pages.count).length)
      const label = 'Page images/'
      if (pages.coverKey) {
        items.push({ path: at(FOLDERS.comic, `Page images/Front cover${extOf(pages.coverKey, '.jpg')}`), key: pages.coverKey, bytes: EST.cover, approx: true, listAs: label,
          note: `The front cover and pages 1 to ${pages.count} as JPEG images, 2000 pixels on the long side. The PDFs above are made from these.` })
      }
      keys.slice(pages.coverKey ? 1 : 0).forEach((key, i) => {
        items.push({ path: at(FOLDERS.comic, `Page images/Page ${pad(i + 1, width)}.jpg`), key, bytes: EST.pageMaster, approx: true, listAs: label,
          note: `The front cover and pages 1 to ${pages.count} as JPEG images, 2000 pixels on the long side. The PDFs above are made from these.` })
      })
    } else {
      absent.push('The finished comic: no artwork has been published for it yet.')
    }
    add('comic', items, 'The finished book: to read, to share and to print.')
  }

  // 02 Language editions ───────────────────────────────────────────────────────
  {
    const items: BundleItem[] = []
    const folderOf = (name: string) => safeFilename(name, 'Edition', 40)
    const editions = (comic.deckPdf?.editions ?? []).filter((e) => !!e.key)
    const covers = (comic.pages?.covers ?? []).filter((c) => !!c.key)
    const blanks = (comic.translations ?? []).filter((t) => !!t.blank?.key)
    const same = (a: string, b: string) => languageName(a).toLowerCase() === languageName(b).toLowerCase()
    for (const name of bookLanguages(comic)) {
      for (const e of editions.filter((x) => same(x.language, name))) {
        items.push({
          path: at(FOLDERS.editions, `${folderOf(name)}/${titled(title, name, '.pdf')}`),
          key: e.key,
          bytes: e.bytes || EST.deckPdf,
          approx: !e.bytes,
          note: `The ${name} edition as its editable deck prints it, with the lettering set as live text.`,
        })
      }
      for (const c of covers.filter((x) => same(x.lang, name))) {
        items.push({
          path: at(FOLDERS.editions, `${folderOf(name)}/Front cover${extOf(c.key, '.jpg')}`),
          key: c.key,
          bytes: EST.cover,
          approx: true,
          note: `The front cover of the ${name} edition.`,
        })
      }
      for (const t of blanks.filter((x) => same(x.language, name))) {
        items.push({
          path: at(FOLDERS.editions, `${folderOf(name)}/Blank pages (no lettering).pdf`),
          key: t.blank!.key,
          bytes: t.blank!.bytes || 0,
          note: `Every page with its lettering taken out, for setting the ${name} text by hand.`,
        })
      }
    }
    add('editions', items, `The book in each of its languages (${listWords(bookLanguages(comic))}), as printed from the editable decks, with each edition's own cover.`)
  }

  // 03 Editable files ──────────────────────────────────────────────────────────
  {
    const ppt: BundleItem[] = []
    const pptNote = 'Opens in PowerPoint or Keynote. The artwork is the page; every caption and balloon is a live text box in CC Wild Words, so install that font to see the lettering as designed.'
    if (comic.editablePpt?.key) {
      ppt.push({ path: at(FOLDERS.editable, `PowerPoint/${titled(title, `${own} (editable)`, '.pptx')}`), key: comic.editablePpt.key, bytes: comic.editablePpt.bytes || 0, note: pptNote })
    }
    for (const t of comic.translations ?? []) {
      if (!t.editablePpt?.key) continue
      ppt.push({ path: at(FOLDERS.editable, `PowerPoint/${titled(title, `${languageName(t.language)} (editable)`, '.pptx')}`), key: t.editablePpt.key, bytes: t.editablePpt.bytes || 0, note: pptNote })
    }
    if (ppt.length === 0) absent.push('An editable PowerPoint deck.')
    add('ppt', ppt, 'The editable deck, one per language: change the words here and the pages can be set again from it.')

    const indd: BundleItem[] = []
    const packageNote = (name: string) =>
      `The ${name} edition for InDesign: the .indd document, an .idml copy for older versions, and a Links folder with the artwork. Unzip it and open the .indd with Links beside it.`
    if (comic.indesign?.key) {
      indd.push({ path: at(FOLDERS.editable, `InDesign/${titled(title, `${own} only`, '.zip')}`), key: comic.indesign.key, bytes: comic.indesign.bytes || 0, note: packageNote(own) })
    }
    for (const t of comic.translations ?? []) {
      if (!t.indesign?.key) continue
      const name = languageName(t.language)
      indd.push({ path: at(FOLDERS.editable, `InDesign/${titled(title, `${name} only`, '.zip')}`), key: t.indesign.key, bytes: t.indesign.bytes || 0, note: packageNote(name) })
    }
    if (comic.indesignAll?.key) {
      const langs = (comic.indesignAll.languages ?? []).map(languageName)
      indd.push({
        path: at(FOLDERS.editable, `InDesign/${titled(title, 'all languages', '.zip')}`),
        key: comic.indesignAll.key,
        bytes: comic.indesignAll.bytes || 0,
        note: `One InDesign document holding ${langs.length ? listWords(langs) : 'every language'}: the artwork on a locked Art layer, and a text layer and paragraph style for each language.`,
      })
    }
    if (indd.length === 0) absent.push('InDesign files.')
    add('indesign', indd, 'InDesign packages: one for each language on its own, and one document that holds every language.')

    const trims: BundleItem[] = []
    const trimItems = (block: TrimmedBlock | undefined, what: string) => {
      for (const t of currentTrims(block)) {
        const label = trimLabel(t)
        trims.push({
          path: at(FOLDERS.editable, `InDesign/${titled(title, `${what} — ${label}`, '.zip')}`),
          key: t.key,
          bytes: t.bytes || 0,
          note: `The ${what} package set at ${label}: each page scaled once and centred, nothing stretched or cropped.`,
        })
      }
    }
    trimItems(comic.indesign, `${own} only`)
    for (const t of comic.translations ?? []) trimItems(t.indesign, `${languageName(t.language)} only`)
    trimItems(comic.indesignAll, 'all languages')
    add('indesignTrim', trims, 'The same InDesign packages set again at the 6.25 × 9 in trim.')
  }

  // 04 Scripts ─────────────────────────────────────────────────────────────────
  const hasDraft = ctx.hasDraft ?? (!!comic.draftKey || (comic.languages?.length ?? 0) > 0)
  {
    const items: BundleItem[] = []
    for (const l of comicLanguages(comic)) {
      if (l.isOriginal && !hasDraft) continue
      const name = languageName(l.code)
      items.push({
        path: at(FOLDERS.scripts, titled(title, `script, ${name}`, '.docx')),
        make: { kind: 'script-docx', lang: l.code, draftKey: l.draftKey, insideCovers: l.isOriginal },
        bytes: EST.scriptDocx,
        approx: true,
        note: l.isOriginal
          ? 'The master script in Word: every page and panel, every line with its source beneath it, then the inside covers.'
          : `The ${name} script in Word, page by page and panel by panel.`,
      })
    }
    if (!hasDraft) absent.push('A published script.')
    const scriptDoc = comic.docs?.items?.find((d) => d.type === 'script')
    if (scriptDoc?.downloadKey) {
      items.push({ path: at(FOLDERS.scripts, titled(title, `script, ${own}`, '.md')), key: scriptDoc.downloadKey, bytes: scriptDoc.bytes || 0,
        note: 'The same script as plain text (Markdown), with its [src:] source tags.' })
    }
    for (const t of comic.translations ?? []) {
      if (!t.script?.key) continue
      const name = languageName(t.language)
      items.push({ path: at(FOLDERS.scripts, titled(title, `script, ${name}`, '.md')), key: t.script.key, bytes: t.script.bytes || 0,
        note: `The ${name} script as plain text (Markdown).` })
    }
    const exp = comic.scriptExports
    if (exp?.docxKey && exp?.pdfKey) {
      const note = 'Every page as a rough panel grid with its captions and balloons in place: the script read as a comic before the art. Word to edit, PDF to print.'
      items.push(
        { path: at(FOLDERS.scripts, titled(title, 'panel layout', '.docx')), key: exp.docxKey, bytes: EST.panelDocx, approx: true, note },
        { path: at(FOLDERS.scripts, titled(title, 'panel layout', '.pdf')), key: exp.pdfKey, bytes: EST.panelPdf, approx: true, note: 'The panel layout as a PDF, ready to print.' },
      )
    }
    const docs = comic.docs
    for (const d of docs?.items ?? []) {
      if (d.type === 'script' || !d.downloadKey) continue
      items.push({
        path: at(FOLDERS.scripts, `Client documents/${safeFilename(d.label, d.type, 70)}.md`),
        key: d.downloadKey,
        bytes: d.bytes || 0,
        note: DOC_NOTES[d.type] ?? d.label,
      })
    }
    if (docs?.bundleKey) {
      items.push({ path: at(FOLDERS.scripts, 'Client documents/All client documents in one file.md'), key: docs.bundleKey, bytes: docs.bundleBytes || 0,
        note: 'Every client document, the script included, one after another in a single file.' })
    }
    if (!docs) absent.push('Client documents (the concept note, the sources and quotes).')
    add('scripts', items, 'The script in Word and as text, in each language, with the panel layout and the documents that go to the client.')
  }

  // 04 Scripts / Review copies ─────────────────────────────────────────────────
  if (pages) {
    const n = pages.count + (pages.coverKey ? 1 : 0)
    const est = n * EST.reviewPerPage
    const dir = 'Review copies'
    add('review', [
      { path: at(FOLDERS.scripts, `${dir}/${titled(title, 'author copy', '.docx')}`), make: { kind: 'review', format: 'author' }, bytes: est, approx: true,
        note: 'Each page image, then its script and the comments on it: for an author or editor to work through.' },
      { path: at(FOLDERS.scripts, `${dir}/${titled(title, 'side by side', '.docx')}`), make: { kind: 'review', format: 'side' }, bytes: est, approx: true,
        note: 'Each page image beside its script and comments, in a landscape table.' },
      { path: at(FOLDERS.scripts, `${dir}/${titled(title, 'LLM package', '.zip')}`), make: { kind: 'review', format: 'llm' }, bytes: est, approx: true,
        note: 'The pages, the script and the comments as comic.json plus images, to hand to an AI assistant.' },
    ], hasDraft
      ? `Review copies built from the ${own} script and every comment on it you can see, resolved ones included.`
      : 'Review copies built from the pages and every comment on them you can see, resolved ones included.')
  }

  // 05 Covers and back matter ──────────────────────────────────────────────────
  {
    const items: BundleItem[] = []
    const options = comic.coverOptions?.options ?? []
    const codes = Array.from(new Set(options.map((o) => (o.lang ?? original).toLowerCase())))
    for (const code of Object.keys(ctx.coverChoices ?? {})) if (!codes.includes(code)) codes.push(code)
    codes.sort((a, b) => Number(b === original) - Number(a === original))
    for (const code of codes) {
      const name = languageName(code)
      const choice = ctx.coverChoices?.[code]
      if (choice?.key) {
        const how = choice.source === 'upload' ? ' (an uploaded cover)' : choice.label ? `: ${coverLabel(choice.label, name)}` : ''
        const who = choice.setByName ? `, chosen by ${choice.setByName}` : ''
        items.push({
          path: at(FOLDERS.covers, `Official cover — ${name}${extOf(choice.key, '.jpg')}`),
          key: choice.key,
          bytes: EST.coverOption,
          approx: true,
          note: `The cover picked on the portal for the ${name} edition${how}${who}.`,
        })
      }
      const mine = options.filter((o) => (o.lang ?? original).toLowerCase() === code)
      const titledOpts = mine.filter((o) => !isBlankPlate(o))
      const blanks = mine.filter(isBlankPlate)
      const folder = `Cover options/${safeFilename(name, 'Edition', 40)}`
      titledOpts.forEach((o, i) => items.push({
        path: at(FOLDERS.covers, `${folder}/${pad(i + 1)} ${safeFilename(coverLabel(o.label, name), 'Option', 70)}${extOf(o.key, '.jpg')}`),
        key: o.key, bytes: EST.coverOption, approx: true, listAs: `${folder}/`,
        note: `The candidate front covers for the ${name} edition, with their titling.`,
      }))
      blanks.forEach((o, i) => items.push({
        path: at(FOLDERS.covers, `${folder}/Clean plates (no titling)/${pad(i + 1)} ${safeFilename(coverLabel(o.label, name), 'Option', 70)}${extOf(o.key, '.jpg')}`),
        key: o.key, bytes: EST.coverOption, approx: true, listAs: `${folder}/Clean plates (no titling)/`,
        note: 'The same cover artwork with no titling, for a designer to set the title on.',
      }))
    }
    if (options.length === 0) absent.push('Cover options.')
    for (const img of comic.insideCovers?.images ?? []) {
      if (!img.key) continue
      items.push({ path: at(FOLDERS.covers, `Inside covers/${safeFilename(img.label, 'Inside cover', 70)}${extOf(img.key)}`), key: img.key, bytes: EST.insideCover, approx: true,
        listAs: 'Inside covers/', note: 'The printed inside front and back covers, for every edition that has its own.' })
    }
    if (comic.backCover?.image?.key) {
      const bc = comic.backCover.image
      items.push({ path: at(FOLDERS.covers, `Back cover/${safeFilename(bc.label, 'Back cover', 70)}${extOf(bc.key)}`), key: bc.key, bytes: EST.backCover, approx: true,
        note: 'The printed back cover: the blurb set over the cover artwork.' })
    }
    ;(comic.activities?.pages ?? []).forEach((p, i) => {
      if (!p.key) return
      items.push({ path: at(FOLDERS.covers, `Activities/${pad(i + 1)} ${safeFilename(p.label, 'Activity', 70)}${extOf(p.key)}`), key: p.key, bytes: EST.activity, approx: true,
        listAs: 'Activities/', note: 'The activity pages that go with the book.' })
    })
    if (comic.aboutTheBook && ((comic.aboutTheBook.backCover?.length ?? 0) > 0 || (comic.aboutTheBook.segments?.length ?? 0) > 0)) {
      const text = aboutTheBookText(comic)
      items.push({ path: at(FOLDERS.covers, 'About the book.txt'), text, bytes: text.length,
        note: 'The back-cover copy, and what to tell each kind of buyer about the book.' })
    }
    add('covers', items, 'The front-cover candidates in each language, the official picks, the inside and back covers, and the activity pages.')
  }

  // 06 Amazon A+ ──────────────────────────────────────────────────────────────
  {
    const items: BundleItem[] = []
    const am = comic.amazonModules
    const sets = am?.groups?.length ? am.groups : am?.images?.length ? [{ title: '', images: am.images }] : []
    for (const g of sets) {
      const sub = g.title ? `${safeFilename(g.title, 'Images', 40)}/` : ''
      g.images.forEach((img, i) => {
        if (!img.key) return
        items.push({
          path: at(FOLDERS.marketing, `${sub}${pad(i + 1)} ${safeFilename(img.label || img.filename, 'Image', 70)}${extOf(img.filename || img.key)}`),
          key: img.key,
          bytes: img.bytes || 0,
          listAs: sub || 'Images',
          note: 'The images in the order they appear on the Amazon page.',
        })
      })
    }
    add('marketing', items, 'The images for the book\'s Amazon A+ content, ready to upload.')
  }

  // 07 Characters ─────────────────────────────────────────────────────────────
  {
    const items: BundleItem[] = []
    const cast = ctx.cast && ctx.cast.people?.length ? ctx.cast : null
    if (cast) {
      const all = mergeCasts([cast])
      const drawn = drawnVersions(all)
      const paths = new Map<string, string>()
      for (const { character, version } of drawn) {
        const rel = `${safeFilename(character.name, 'Character', 40)}/${versionFile(character, version)}`
        paths.set(version.uid, rel)
        items.push({ path: at(FOLDERS.characters, rel), key: version.key!, bytes: version.bytes || EST.sheet, approx: !version.bytes,
          listAs: 'One folder per character', note: 'Each drawn character sheet at full resolution, in a folder named for the character.' })
      }
      if (drawn.length) {
        const printBytes = drawn.reduce((n, { version: v }) => n + (v.printBytes || EST.sheetPrint), 0)
        items.unshift({ path: at(FOLDERS.characters, 'Characters — contact sheet.pdf'), make: { kind: 'character-pdf' }, bytes: printBytes + drawn.length * 20_000, approx: true,
          note: 'Every drawn sheet on a page of its own, naming the pages each character is on, with what is not drawn yet at the end.' })
      }
      const text = castListText(title, all, paths)
      items.unshift({ path: at(FOLDERS.characters, 'Cast list.txt'), text, bytes: text.length,
        note: 'Every character the book stages, drawn or not, with the pages they are on and where their sheets are.' })
    } else if (comic.characters?.people?.length) {
      const people = comic.characters.people
      const lines: string[] = [...heading('CHARACTERS', '='), title, '']
      for (const p of people) {
        lines.push(p.name)
        for (const v of p.versions) {
          if (v.drawn && v.key) {
            const rel = `${safeFilename(p.name, 'Character', 40)}/${safeFilename(`${p.name} — ${v.stage}`, 'Sheet', 60)}${extOf(v.key)}`
            items.push({ path: at(FOLDERS.characters, rel), key: v.key, bytes: EST.sheet, approx: true, listAs: 'One folder per character',
              note: 'Each drawn character sheet, in a folder named for the character.' })
            lines.push(`  - ${v.stage}: ${rel}`)
          } else {
            lines.push(`  - ${v.stage}: NOT DRAWN YET`)
          }
        }
        lines.push('')
      }
      const text = asTxt(lines)
      items.unshift({ path: at(FOLDERS.characters, 'Cast list.txt'), text, bytes: text.length, note: 'Every character in the book and which of their looks are drawn.' })
    } else {
      absent.push('Character sheets.')
    }
    add('characters', items, 'The book\'s cast: every drawn sheet, a contact-sheet PDF, and a list that also names who is not drawn yet.')
  }

  // 08 Research ───────────────────────────────────────────────────────────────
  {
    const items: BundleItem[] = []
    const f = ctx.figure
    if (f) {
      const kindRank = (k: string) => {
        const i = KIND_ORDER.indexOf(k)
        return i === -1 ? KIND_ORDER.length : i
      }
      const sources = [...(f.sources ?? [])].sort((a, b) =>
        kindRank(a.kind) - kindRank(b.kind) || sourceTitle(a).localeCompare(sourceTitle(b)))
      let stale = 0
      for (const s of sources) {
        if (!s.files?.length) continue
        const dir = safeFilename(kindFolder(s.kind), 'Other', 40)
        const name = safeFilename(sourceTitle(s), 'Source', 70)
        const words = (s.words ?? 0).toLocaleString('en-US')
        const note = `${kindLabel(s.kind)}, ${words} words${s.files.length > 1 ? ` in ${s.files.length} parts` : ''}.`
        const pdf = sourcePdf(s)
        // A source with both forms is one README line: "Books/<title>.pdf + .md".
        const label = pdf ? `${dir}/${name}${pdf.format === 'zip' ? ' (PDFs).zip' : '.pdf'} + .md` : undefined
        if (pdf) {
          items.push({ path: at(FOLDERS.research, `${dir}/${name}${pdf.format === 'zip' ? ' (PDFs).zip' : '.pdf'}`), key: pdf.key, bytes: pdf.bytes || 0, listAs: label, note })
        } else {
          stale += 1
        }
        if (sourceBundleIsCurrent(s) && s.bundle?.md?.key) {
          items.push({ path: at(FOLDERS.research, `${dir}/${name}.md`), key: s.bundle.md.key, bytes: s.bundle.md.bytes || 0, listAs: label, note })
        } else {
          items.push({ path: at(FOLDERS.research, `${dir}/${name}.md`), make: { kind: 'research-md', sourceSlug: s.slug },
            bytes: Math.round((s.words || 1000) * EST.wordBytes), approx: true, listAs: label, note })
        }
      }
      // The dossier, design bible and characterization are research SOURCES already (kinds
      // character-dossier / design-bible / characterization, filed under "Design & dossier");
      // the figure's own `dossierKey`-style fields are repo paths to the same files, so only
      // the design turnarounds are added here, beside them.
      const fig = f.figure
      const designDir = safeFilename(kindFolder('character-dossier'), 'Design', 40)
      ;(fig.variations ?? []).forEach((v, i) => {
        if (!v.key) return
        items.push({ path: at(FOLDERS.research, `${designDir}/Design variations/${pad(i + 1)} ${safeFilename(v.label, 'Variation', 70)}${extOf(v.key)}`),
          key: v.key, bytes: v.bytes || EST.variation, approx: !v.bytes, listAs: `${designDir}/Design variations/`, note: 'The locked design turnarounds.' })
      })
      if (stale) {
        notes.push(`${plural(stale, 'research source')} changed after ${stale === 1 ? 'its PDF was' : 'their PDFs were'} typeset, so this download has ${stale === 1 ? 'its' : 'their'} text but not ${stale === 1 ? 'its' : 'their'} PDF.`)
      }
      const subject = comic.subject || figureNameOf(fig)
      add('research', items, `The research behind the book on ${subject}: each source typeset as a PDF to read, and as one Markdown file with the full text.`)
    } else {
      absent.push('A research library for the book\'s subject.')
    }
  }

  // 09 History and comments ───────────────────────────────────────────────────
  {
    const history = historyText(comic)
    const threads = ctx.threads ?? []
    const comments = commentsText(comic, threads)
    add('history', [
      { path: at(FOLDERS.history, 'Version history and corrections.txt'), text: history, bytes: history.length,
        note: 'Every recorded change to the script and the artwork, and every correction raised on the book with where it stands.' },
      { path: at(FOLDERS.history, 'Comments.txt'), text: comments, bytes: comments.length,
        note: threads.length ? `${plural(threads.length, 'comment thread')} from the portal, in every language and every status.` : 'No comments have been left on this book on the portal.' },
    ], 'What changed and when, and what reviewers said.')
  }

  // Fit every path and make it unique across the whole zip.
  const all = groups.flatMap((g) => g.items)
  const fitted = uniquePaths(all.map((i) => fitPath(i.path)))
  all.forEach((it, i) => { it.path = fitted[i] })

  groups.sort((a, b) => GROUP_ORDER.indexOf(a.id) - GROUP_ORDER.indexOf(b.id))
  return { root, zipName: `${root} — all files.zip`, groups, absent, notes }
}

function figureNameOf(f: Pick<Figure, 'slug'>): string {
  return f.slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

function versionFile(c: Pick<WorkCharacter, 'name'>, v: Pick<WorkVersion, 'label' | 'key'>): string {
  const stem = `${c.name} — ${v.label.replace(/\s*\(cast library\)$/, '')}`
  return `${safeFilename(stem, 'Sheet', 60)}${extOf(v.key)}`
}

// ─── the text files ───────────────────────────────────────────────────────────

/** `3, 5–9, 12` — consecutive pages collapse. */
function pageRanges(pages: number[]): string {
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b)
  const runs: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    runs.push(j > i ? `${sorted[i]}–${sorted[j]}` : `${sorted[i]}`)
    i = j + 1
  }
  return runs.join(', ')
}

export function aboutTheBookText(comic: Comic): string {
  const about = comic.aboutTheBook
  const lines: string[] = [...heading('ABOUT THE BOOK', '='), comic.title, '']
  if (about?.backCover?.length) {
    lines.push(...heading('On the back cover'), '')
    for (const p of about.backCover) lines.push(...wrap(p), '')
  }
  if (about?.segments?.length) {
    lines.push(...heading('What to tell each reader and buyer'), '')
    for (const seg of about.segments) {
      lines.push(seg.label || seg.audience)
      for (const p of seg.pointers ?? []) {
        const w = wrap(p, 78, '    ')
        if (w.length) w[0] = `  - ${w[0].trimStart()}`
        lines.push(...w)
      }
      lines.push('')
    }
  }
  return asTxt(lines)
}

export function castListText(title: string, all: WorkCharacter[], paths: Map<string, string>): string {
  const t = castTotals(all)
  const lines: string[] = [...heading('CHARACTERS', '='), title, '']
  lines.push(
    `${plural(t.characters, 'character')}, ${t.versionsDrawn} of ${t.versions} versions drawn` +
      (t.versionsOwed ? `, ${t.versionsOwed} not drawn yet` : '') +
      (t.generalized ? `, ${t.generalized} generalised` : '') + '.',
    '',
    ...wrap('Every character the book stages is listed here, drawn or not. A version marked NOT DRAWN YET is one the book needs and nobody has drawn. Generalised characters are the unnamed roles, crowds and stock extras, described in the page text rather than drawn as a sheet.'),
    '',
  )
  for (const c of all) {
    const kind = c.kind === 'generalized' ? 'Generalised character' : c.kind === 'shared' ? 'Shared cast (the line\'s own characters)' : 'Named character'
    const bits = [kind]
    if (c.appearances) bits.push(`on ${plural(c.appearances, 'page')}`)
    if (c.spoken) bits.push(plural(c.spoken, 'spoken line'))
    lines.push(c.name, `  ${bits.join(', ')}.`)
    if (c.role) lines.push(...wrap(c.role, 78, '  '))
    for (const v of c.versions) {
      const pages = v.comics.flatMap((a) => a.pages)
      const uniq = new Set(pages)
      const where = uniq.size ? ` (${uniq.size === 1 ? 'page' : 'pages'} ${pageRanges(pages)})` : v.unstaged ? ' (not staged on a page yet)' : ''
      const rel = paths.get(v.uid)
      const state = rel ?? (v.drawn ? 'drawn, sheet not available to you' : v.text ? 'described in the page text' : 'NOT DRAWN YET')
      lines.push(...wrap(`- ${v.label}: ${state}${where}`, 78, '    ').map((l, i) => (i === 0 ? `  ${l.trimStart()}` : l)))
    }
    lines.push('')
  }
  return asTxt(lines)
}

function entryLine(e: string | { date?: string; note: string }): { date: string; note: string } {
  if (typeof e === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})\s*[—–-]\s*([\s\S]*)$/.exec(e)
    return m ? { date: m[1], note: m[2] } : { date: '', note: e }
  }
  return { date: e.date ? String(e.date).slice(0, 10) : '', note: e.note ?? '' }
}

export function historyText(comic: Comic): string {
  const lines: string[] = [...heading('VERSION HISTORY AND CORRECTIONS', '='), comic.title, '']
  const log = (label: string, version: number | undefined, updated: string | undefined, entries: (string | { date?: string; note: string })[] | undefined) => {
    lines.push(...heading(label))
    const state = [version != null ? `Version ${version}` : null, updated ? `last changed ${longDate(updated)}` : null].filter(Boolean).join(', ')
    if (state) lines.push(`${state}.`)
    lines.push('')
    if (!entries?.length) {
      lines.push('  Nothing recorded.', '')
      return
    }
    for (const e of entries) {
      const { date, note } = entryLine(e)
      const w = wrap(note, 78, '      ')
      lines.push(date ? `  ${longDate(date)}` : '  (undated)')
      lines.push(...(w.length ? w : ['      —']))
    }
    lines.push('')
  }
  log('SCRIPT', comic.version, comic.updated, comic.changelog)
  if (comic.artChangelog?.length || comic.artVersion != null) log('ARTWORK', comic.artVersion, comic.artUpdated, comic.artChangelog)
  const corr = comic.corrections
  lines.push(...heading('CORRECTIONS'))
  if (!corr?.items?.length) {
    lines.push('No corrections are recorded for this book.', '')
  } else {
    const c = corr.counts
    const parts = [
      c.applied ? `${c.applied} applied` : null,
      c.raisedWithDiamond ? `${c.raisedWithDiamond} raised with Diamond` : null,
      c.needsDecision ? `${c.needsDecision} waiting for a decision` : null,
      c.pendingArt ? `${c.pendingArt} waiting for new art` : null,
      c.toRaise ? `${c.toRaise} still to raise` : null,
    ].filter(Boolean)
    lines.push(`${plural(corr.total ?? corr.items.length, 'item')} raised${parts.length ? `: ${parts.join(', ')}` : ''}.`, '')
    const STATE: Record<string, string> = {
      applied: 'Applied', 'raised-with-diamond': 'Raised with Diamond', 'needs-decision': 'Needs a decision',
      'pending-art': 'Waiting for new art', 'to-raise': 'To raise',
    }
    for (const it of corr.items) {
      const head = [`[${STATE[it.state] ?? it.state}]`, it.page ? `page ${it.page}` : null, it.id].filter(Boolean).join('  ')
      lines.push(`  ${head}`)
      lines.push(...wrap(it.summary, 78, '      '))
      if (it.note) lines.push(...wrap(`Note: ${it.note}`, 78, '      '))
      if (it.done) lines.push(`      Done ${longDate(it.done)}.`)
      lines.push('')
    }
  }
  return asTxt(lines)
}

/** Where a comment is pinned, in words: "page 2, panel 1". */
function anchorWords(a: Anchor): string {
  if (a.kind === 'passage') return `chapter ${a.chapter ?? a.page}, paragraph ${a.para ?? '?'}`
  if (a.kind === 'page') return `page ${a.page}`
  if (a.kind === 'box') return `page ${a.page}, box ${a.box ?? '?'}`
  if (a.panel != null) return `page ${a.page}, panel ${a.panel}`
  return anchorLabel(a)
}

export function commentsText(comic: Comic, threads: Thread[]): string {
  const original = (comic.originalLanguage ?? 'en').toLowerCase()
  const lines: string[] = [...heading('COMMENTS', '='), comic.title, '']
  if (threads.length === 0) {
    lines.push('No comments have been left on this book on the portal.')
    return asTxt(lines)
  }
  lines.push(...wrap(`${plural(threads.length, 'comment thread')}: every one you can see on the portal, in every language and every status, oldest first on each page. Page numbers are the book's own.`), '')
  const firstPage = (t: Thread) => (t.root.anchors.length ? Math.min(...t.root.anchors.map((a) => a.page)) : Infinity)
  const sorted = [...threads].sort((a, b) => firstPage(a) - firstPage(b) || toMillis(a.root.createdAt) - toMillis(b.root.createdAt))
  let currentPage: number | null = null
  for (const t of sorted) {
    const p = firstPage(t)
    const group = Number.isFinite(p) ? p : -1
    if (group !== currentPage) {
      currentPage = group
      lines.push(...heading(group === -1 ? 'NOT TIED TO A PAGE' : `PAGE ${group}`), '')
    }
    const n = t.root
    const status = STATUS_COLOR[(n.status ?? 'open') as Status]?.label ?? statusLabel(n.status)
    const category = CATEGORY_LABELS[(n.category ?? 'other') as Category] ?? 'Other'
    const anchor = n.anchors.find((a) => a.page === p) ?? n.anchors[0]
    const lang = languageName(nodeLang(n, original))
    const flags = [isDraft(n) ? 'draft, not yet published' : null, n.hidden ? 'hidden' : null].filter(Boolean)
    lines.push(`  [${status}] ${category}${anchor ? ` · ${anchorWords(anchor)}` : ''} · ${lang}${flags.length ? ` (${flags.join(', ')})` : ''}`)
    lines.push(`  ${n.authorName || 'Someone'}${n.authorRole ? ` (${n.authorRole})` : ''}${isoDay(n.createdAt) ? `, ${longDate(isoDay(n.createdAt))}` : ''}`)
    if (anchor?.snapshot && anchor.kind !== 'page') lines.push(...wrap(`On: "${anchor.snapshot}"`, 78, '  '))
    const also = Array.from(new Set(n.anchors.map((a) => a.page))).filter((x) => x !== p).sort((a, b) => a - b)
    if (also.length) lines.push(`  Also on page${also.length > 1 ? 's' : ''} ${also.join(', ')}.`)
    if (n.suggestion) lines.push(...wrap(`Suggests: replace "${n.suggestion.from}" with "${n.suggestion.to}"`, 78, '  '))
    lines.push(...wrap(n.body, 78, '  '))
    for (const r of t.replies) {
      const when = isoDay(r.createdAt)
      lines.push(...wrap(`Reply from ${r.authorName || 'someone'}${r.authorRole ? ` (${r.authorRole})` : ''}${when ? `, ${longDate(when)}` : ''}: ${r.body}`, 78, '      ')
        .map((l, i) => (i === 0 ? `    ↳ ${l.trimStart()}` : l)))
    }
    lines.push('')
  }
  return asTxt(lines)
}

// ─── the README ───────────────────────────────────────────────────────────────

export interface ReadmeRun {
  selected: Set<BundleGroupId>
  failed: string[]
  written: Record<string, number>
  /** `2026-10-21`. */
  today: string
}

/** The README.txt at the top of the zip: what the book is, what is where, what is not here. */
export function bundleReadme(plan: BundlePlan, comic: Comic, run: ReadmeRun): string {
  const failed = new Set(run.failed)
  const chosen = plan.groups.filter((g) => run.selected.has(g.id))
  const leftOut = plan.groups.filter((g) => !run.selected.has(g.id))
  const prefix = `${plan.root}/`
  const sizeOf = (it: BundleItem) => run.written[it.path] ?? 0
  const arrived = chosen.flatMap((g) => g.items).filter((it) => !failed.has(it.path))
  const totalBytes = arrived.reduce((n, it) => n + sizeOf(it), 0)

  const title = comic.title || comic.slug
  const lines: string[] = [title.toUpperCase(), '='.repeat(Math.min(78, Math.max(4, title.length))), '']
  lines.push(...wrap('Every file the Studio Whence portal holds for this book, sorted into numbered folders. This file explains what each folder and file is.'), '')

  const facts: [string, string | undefined][] = [
    ['Subject', comic.subject],
    ['Series', [comic.series, comic.comic_number ? `comic ${comic.comic_number}` : null].filter(Boolean).join(', ') || undefined],
    ['Status', statusLabel(comic.status)],
    ['Pages', comic.pages?.hasPages ? String(comic.pages.count) : comic.target_length_pages != null ? `${comic.target_length_pages} planned` : undefined],
    ['Languages', bookLanguages(comic).map((l, i) => (i === 0 ? `${l} (original)` : l)).join(', ')],
    ['Script', [comic.version != null ? `version ${comic.version}` : null, comic.updated ? `last changed ${longDate(comic.updated)}` : null].filter(Boolean).join(', ') || undefined],
    ['Artwork', [comic.artVersion != null ? `version ${comic.artVersion}` : null, comic.artUpdated ? `last changed ${longDate(comic.artUpdated)}` : null].filter(Boolean).join(', ') || undefined],
    ['Downloaded', longDate(run.today)],
    ['In this zip', `${plural(arrived.length + 1, 'file')}, ${formatBytes(totalBytes)}`],
  ]
  for (const [k, v] of facts) if (v) lines.push(`  ${k.padEnd(12)}${v}`)
  lines.push('')

  lines.push(...heading('HOW THIS ZIP IS ARRANGED'), '')
  lines.push(...wrap('The folders are numbered, and each keeps its number in every book\'s download: 01 is always the comic and 07 always the characters. A missing number means this book has nothing of that kind yet, or it was left out of this download. Both are listed at the end, under NOT IN THIS DOWNLOAD.'), '')

  // Folders, in order, each with the groups that fill it.
  const folders = Array.from(new Set(chosen.map((g) => g.folder)))
  folders.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  for (const folder of folders) {
    lines.push(...heading(folder.toUpperCase()), '')
    for (const g of chosen.filter((x) => x.folder === folder)) {
      const shared = chosen.filter((x) => x.folder === folder).length > 1
      lines.push(...wrap(shared ? `${g.title}. ${g.blurb}` : g.blurb), '')
      const base = `${prefix}${folder}/`
      const seen = new Set<string>()
      for (const it of g.items) {
        if (it.listAs) {
          if (seen.has(it.listAs)) continue
          seen.add(it.listAs)
          const set = g.items.filter((x) => x.listAs === it.listAs)
          const ok = set.filter((x) => !failed.has(x.path))
          const miss = set.length - ok.length
          const bytes = ok.reduce((n, x) => n + sizeOf(x), 0)
          const count = set.length === 1 ? formatBytes(bytes) : `${plural(set.length, 'file')}, ${formatBytes(bytes)}`
          lines.push(`  ${it.listAs}  (${count}${miss ? `; ${miss} could not be fetched` : ''})`)
          if (it.note) lines.push(...wrap(it.note, 78, '      '))
          continue
        }
        const rel = it.path.startsWith(base) ? it.path.slice(base.length) : it.path.slice(prefix.length)
        const size = failed.has(it.path) ? 'could not be fetched' : formatBytes(sizeOf(it))
        lines.push(`  ${rel}  (${size})`)
        if (it.note) lines.push(...wrap(it.note, 78, '      '))
      }
      lines.push('')
    }
  }

  lines.push(...heading('NOT IN THIS DOWNLOAD'), '')
  if (leftOut.length) {
    lines.push('Left out when this was downloaded:')
    for (const g of leftOut) lines.push(`  - ${g.title} (${g.folder}): ${plural(g.items.length, 'file')}, ${g.approx ? 'about ' : ''}${formatBytes(g.bytes)}`)
    lines.push('')
  }
  if (plan.absent.length) {
    lines.push('This book has none of these on the portal:')
    for (const a of plan.absent) lines.push(...wrap(a, 78, '    ').map((l, i) => (i === 0 ? `  - ${l.trimStart()}` : l)))
    lines.push('')
  }
  for (const n of plan.notes) lines.push(...wrap(n), '')
  if (!leftOut.length && !plan.absent.length && !plan.notes.length) lines.push('Nothing: this is everything the portal holds for the book.', '')

  if (run.failed.length) {
    lines.push(...heading('COULD NOT BE FETCHED'), '')
    lines.push(...wrap('These files were meant to be in this zip but did not arrive. Download them from the book\'s page on the portal, or run Download all again.'), '')
    for (const p of run.failed) lines.push(`  - ${p.startsWith(prefix) ? p.slice(prefix.length) : p}`)
    lines.push('')
  }

  lines.push('Made by Studio Whence for Diamond Pocket Books.')
  return asTxt(lines)
}

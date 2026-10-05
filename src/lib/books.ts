// Pure types + helpers for the Books surface (prose books). No Firestore or React
// imports, so everything here is unit-testable.
//
// A book is a comic doc with `format: 'prose'`. Its text is not HTML: the content
// pipeline (tools/publish_book.py in the content repo) publishes a JSON reader
// model to drafts/{line}/{slug}/manuscript.json — chapters → blocks → parts, with
// every [src:] tag already resolved to the research key it opens. The browser
// never parses a citation tag.

import type { Comic } from '@/types/content'
import type { Anchor } from '@/lib/feedbackTypes'

export interface BookCite {
  /** Display number, restarting at 1 in each chapter (endnote style). */
  n: number
  /** Repo-relative research path, e.g. biographies/…/chapters/05-….md */
  path: string
  /** The gated R2 key the reader opens: research/<path>. */
  key: string
  line: number
  lines: number[]
  figure: string | null
  label: string
  /** Human title of the source (a book, an interview, a filing), when the publisher knows it. */
  title?: string
}

export type BookPart = { t: string } | { cite: number }

export interface BookBlock {
  /** "c3.p12" for a paragraph, "c3.e1" for an epigraph; absent for a break. */
  id?: string
  kind: 'para' | 'epigraph' | 'break'
  parts?: BookPart[]
  words?: number
}

export interface BookChapter {
  n: number
  id: string
  /** "Chapter 3", or an unnumbered label such as "Prologue". Absent in older models. */
  label?: string
  title: string
  words: number
  blocks: BookBlock[]
  cites: BookCite[]
}

export interface BookModel {
  schemaVersion: number
  line: string
  slug: string
  title: string
  subtitle?: string | null
  shelf?: string | null
  status?: string | null
  audience?: string | null
  logline?: string | null
  timeSpan?: string | null
  language?: string | null
  updated?: string | null
  words: number
  chapters: BookChapter[]
}

/** Books lines are `books-<category>` (books-biographies, books-indic, …). The
 *  prefix lives here, in a pure module, so anything can test a slug without
 *  importing the Firestore-backed surface module. */
export const BOOKS_LINE_PREFIX = 'books-'

export function isBooksLine(slug: string | null | undefined): boolean {
  return Boolean(slug && slug.startsWith(BOOKS_LINE_PREFIX))
}

export function isBook(comic: Pick<Comic, 'format'> | null | undefined): boolean {
  return comic?.format === 'prose'
}

export function manuscriptKeyFor(comic: Pick<Comic, 'line' | 'slug' | 'manuscriptKey'>): string {
  return comic.manuscriptKey || `drafts/${comic.line}/${comic.slug}/manuscript.json`
}

/** Parse the published reader model; null when the text is not a model we understand. */
export function parseBookModel(text: string | null | undefined): BookModel | null {
  if (!text) return null
  try {
    const m = JSON.parse(text) as BookModel
    if (!m || typeof m !== 'object' || !Array.isArray(m.chapters)) return null
    return m
  } catch {
    return null
  }
}

/** The visible text of a block: citation markers removed, *italic* markers dropped (they render
 *  as italics, so a reader's selection never contains the asterisks). */
export function blockText(block: BookBlock): string {
  return (block.parts ?? []).map((p) => ('t' in p ? p.t : '')).join('').replace(/\*([^*\n]+)\*/g, '$1')
}

/** A text part as runs: the manuscript marks titles as *Empire of AI*. */
export function inlineRuns(text: string): { text: string; italic: boolean }[] {
  return text.split(/\*([^*\n]+)\*/).map((t, i) => ({ text: t, italic: i % 2 === 1 })).filter((r) => r.text)
}

export const SHELF_LABEL: Record<string, string> = {
  nonfiction: 'Nonfiction',
  novelised: 'Novelised',
}

/** Reading time at an unhurried 230 words a minute, rounded to the hour above 90 min. */
export function readingTime(words: number): string {
  const mins = Math.max(1, Math.round(words / 230))
  if (mins < 90) return `${mins} min read`
  return `${Math.round(mins / 60)} hr read`
}

export function formatWords(words: number | undefined | null): string {
  if (!words) return '0 words'
  if (words >= 10_000) return `${Math.round(words / 1000)}k words`
  return `${words.toLocaleString('en-IN')} words`
}

/** Parse a passage ref "c3.p12" → {chapter: 3, para: 12}. */
export function parsePassageRef(ref: string): { chapter: number; para: number } | null {
  const m = /^c(\d+)\.p(\d+)$/.exec(ref)
  return m ? { chapter: Number(m[1]), para: Number(m[2]) } : null
}

export function passageAnchor(blockId: string, quote: string, paragraphText: string): Anchor | null {
  const pos = parsePassageRef(blockId)
  if (!pos) return null
  const snapshot = paragraphText.length > 280 ? `${paragraphText.slice(0, 279)}…` : paragraphText
  return { kind: 'passage', ref: blockId, page: pos.chapter, chapter: pos.chapter, para: pos.para,
           quote: quote.trim(), snapshot }
}

export type AnchorLocation =
  | { state: 'exact'; blockId: string }
  | { state: 'moved'; blockId: string }
  | { state: 'outdated'; blockId: string | null }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Where a passage anchor's words live in the current text.
 *
 * exact    — the anchored paragraph still holds the quoted words
 * moved    — the words are found elsewhere in the same chapter (a paragraph was
 *            inserted or removed above); the comment follows them
 * outdated — the words are gone; the comment stays, pointing at its old place,
 *            and says the text has changed since
 */
export function locatePassage(model: BookModel, anchor: Anchor): AnchorLocation {
  const pos = parsePassageRef(anchor.ref)
  if (!pos) return { state: 'outdated', blockId: null }
  const chapter = model.chapters.find((c) => c.n === pos.chapter)
  if (!chapter) return { state: 'outdated', blockId: null }
  const quote = norm(anchor.quote ?? '')
  const own = chapter.blocks.find((b) => b.id === anchor.ref)
  if (own && (!quote || norm(blockText(own)).includes(quote))) return { state: 'exact', blockId: anchor.ref }
  if (quote) {
    const hit = chapter.blocks.find((b) => b.id && b.kind !== 'break' && norm(blockText(b)).includes(quote))
    if (hit?.id) return { state: 'moved', blockId: hit.id }
  }
  return { state: 'outdated', blockId: own?.id ?? null }
}

/** Document order for passage refs: chapter, then paragraph. Non-passage refs sort last. */
export function passageOrder(ref: string | undefined): number {
  const pos = ref ? parsePassageRef(ref) : null
  return pos ? pos.chapter * 100_000 + pos.para : Number.MAX_SAFE_INTEGER
}

/** A stable cover colour per book, from a small palette that sits on the brand cream. */
const COVER_TONES = ['#3B3664', '#7B6C5D', '#443A70', '#5C4A3A', '#2F4858', '#6B3A4A']
export function coverTone(slug: string): string {
  let h = 0
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COVER_TONES[h % COVER_TONES.length]
}

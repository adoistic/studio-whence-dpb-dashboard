/**
 * search.ts — matching and ranking over the page index.
 *
 * The corpus is ~5.7k page-documents, so a linear scan per query is both fast
 * enough and far simpler than an inverted index. Simplicity is the point: this
 * is one readable file rather than a shard format nobody can debug.
 */
import type { Query, Term } from './query'
import type { ScopedDoc } from './allocation'

export interface IndexDoc extends ScopedDoc {
  slug: string
  title: string
  lang: string
  page: number
  text: string
  refs: string[]
}

export interface Hit {
  doc: IndexDoc
  score: number
  snippet: string
}

/** Words of at least this length may match with one edit. Shorter words are
 *  matched strictly: fuzzing three-letter words turns every query to mush. */
const FUZZ_MIN_LENGTH = 5

/**
 * Unicode-aware word split.
 *
 * `\p{M}` (combining marks) is NOT optional: Devanagari vowel signs are marks,
 * not letters, so a class of only letters+numbers splits INSIDE every Hindi
 * word — मुख्यमंत्री becomes six fragments and never matches itself. Hindi is a
 * first-class language in this corpus, so this is a correctness requirement,
 * not a nicety.
 */
const WORD_SPLIT = /[^\p{L}\p{N}\p{M}]+/u

/** True when `a` and `b` are within one insert/delete/substitute. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (a.length < b.length) j++
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

export function matchesTerm(haystack: string, term: Term): boolean {
  if (term.exact) return haystack.includes(term.text)
  for (const word of haystack.split(WORD_SPLIT)) {
    if (!word) continue
    if (word.startsWith(term.text)) return true
    if (term.text.length >= FUZZ_MIN_LENGTH && withinOneEdit(word, term.text)) return true
  }
  return false
}

/** How strongly one group matched — an exact word beats a prefix beats a fuzz. */
function groupScore(words: string[], haystack: string, group: Term[]): number {
  let best = 0
  for (const term of group) {
    if (term.exact) {
      if (haystack.includes(term.text)) best = Math.max(best, 3)
      continue
    }
    for (const word of words) {
      if (word === term.text) { best = Math.max(best, 3); break }
      if (word.startsWith(term.text)) best = Math.max(best, 2)
      else if (term.text.length >= FUZZ_MIN_LENGTH && withinOneEdit(word, term.text)) {
        best = Math.max(best, 1)
      }
    }
  }
  return best
}

const SNIPPET_RADIUS = 90

function snippetFor(text: string, query: Query): string {
  const lower = text.toLowerCase()
  let at = -1
  for (const group of query) {
    for (const term of group) {
      const i = lower.indexOf(term.text)
      if (i !== -1 && (at === -1 || i < at)) at = i
    }
  }
  if (at === -1) return text.slice(0, SNIPPET_RADIUS * 2).trim()
  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(text.length, at + SNIPPET_RADIUS)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/**
 * Every document satisfying EVERY group, ranked.
 *
 * `total` is the full match count, not the page length: the whole set is ranked
 * and only then sliced, so "load more" is honest about how much there is.
 */
export function searchDocs(
  docs: IndexDoc[], query: Query, limit: number, offset: number,
): { total: number; hits: Hit[] } {
  if (query.length === 0) return { total: 0, hits: [] }

  const matched: Hit[] = []
  for (const doc of docs) {
    const haystack = doc.text.toLowerCase()
    const words = haystack.split(WORD_SPLIT).filter(Boolean)
    let score = 0
    let all = true
    for (const group of query) {
      const s = groupScore(words, haystack, group)
      if (s === 0) { all = false; break }
      score += s
    }
    if (!all) continue
    // A hit in the title is worth more than one buried mid-page.
    const title = doc.title.toLowerCase()
    if (query.some((g) => g.some((t) => title.includes(t.text)))) score += 2
    matched.push({ doc, score, snippet: snippetFor(doc.text, query) })
  }

  matched.sort((a, b) =>
    b.score - a.score ||
    a.doc.comicId.localeCompare(b.doc.comicId) ||
    a.doc.page - b.doc.page)

  return { total: matched.length, hits: matched.slice(offset, offset + limit) }
}

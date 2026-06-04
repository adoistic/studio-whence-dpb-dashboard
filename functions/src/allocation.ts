/**
 * allocation.ts — the work-allocation gate for the R2 data backbone.
 *
 * Firestore rules already hide non-allocated comics/research from MEMBERS in
 * the catalog. But the actual drafts, images, and research bytes are served
 * from R2 through the Cloud Function (`/resolve` presigns keys, `/read` proxies
 * bytes). Without an allocation check HERE a member could fetch a hidden
 * comic's draft straight from the function. This module is that check.
 *
 * Admin + sub-admins bypass (decided in `index.ts` via `authorize().moderator`);
 * this module is consulted only for plain members.
 *
 * Two responsibilities:
 *   1. `scopeOfKey` — a PURE parser mapping an R2 object key → the work scope it
 *      belongs to (`{ line?, subject?, comicId? }`). No I/O.
 *   2. `getAllocation` / `comicSubject` / `isKeyAllowedForMember` — the Firestore
 *      reads + the allow decision. Fail-closed: an unattributable scope, a
 *      missing allocation doc, or an empty scope all DENY.
 *
 * Read budget: the allocation doc is read ONCE per request (in `index.ts`) and
 * passed in here. Only a DRAFT key triggers a second read (the comic doc, to
 * learn its subject for the figure-grant test). So ≤2 Firestore reads per key.
 */

import { getFirestore } from 'firebase-admin/firestore'

/** The work scope an R2 key belongs to. Any field may be absent. An empty
 * object means "could not be attributed" → a member is denied (fail-closed). */
export interface KeyScope {
  line?: string
  subject?: string
  comicId?: string
}

/** A member's allocation grants. Missing fields default to empty arrays. */
export interface Allocation {
  lines: string[]
  figures_effective: string[]
  comics: string[]
}

/** Injectable Firestore readers so the allow logic is unit-testable without a
 * live Admin SDK. Both default to the real Firestore in `isKeyAllowedForMember`. */
export interface AllocationDeps {
  comicSubject: (comicId: string) => Promise<string | null>
}

/**
 * Parse an R2 object key into the work scope it belongs to. PURE — no I/O.
 *
 * Shapes (verified against the publish pipeline):
 *   - `drafts/{line}/{slug}.html`
 *       → { comicId: `{line}__{slug}`, line }. Subject is NOT in the path; it
 *         must be looked up from the comic doc (done in isKeyAllowedForMember).
 *   - `research/{rel}` where `rel` is a repo-relative POSIX path:
 *       biographies: `research/biographies/NN-…/_books/{subject}/…`
 *         → line = first segment after `research/`; subject = segment after `_books/`.
 *       indic/other: `research/indic/<Epic>/characters/{name}/…` or `…/core/…`
 *         → line = first segment after `research/`; subject = segment after
 *           `characters/` if present, else none.
 *   - `images/{rel}` and `artifacts/{rel}`: parse the same way — look for a
 *       `_books/{subject}` segment, a `drafts/{line}/{slug}` shape, or a
 *       `_comics/` marker. If a line/subject can't be attributed → `{}` (deny).
 *
 * Returns `{}` when nothing can be attributed.
 */
export function scopeOfKey(key: string): KeyScope {
  if (typeof key !== 'string' || key.length === 0) return {}
  const parts = key.split('/').filter((p) => p.length > 0)
  if (parts.length === 0) return {}

  const top = parts[0]

  // ── drafts/{line}/{slug}.html ───────────────────────────────────────────
  if (top === 'drafts') {
    const line = parts[1]
    const file = parts[2]
    if (!line || !file) return {}
    const slug = file.replace(/\.html$/i, '')
    if (!slug) return {}
    return { line, comicId: `${line}__${slug}` }
  }

  // ── research / images / artifacts / … shared rel-path parsing ───────────
  // `rel` is everything after the top-level bucket prefix.
  const rel = parts.slice(1)
  if (rel.length === 0) return {}

  const scope: KeyScope = {}

  // A `drafts/{line}/{slug}` shape can also appear nested under images/artifacts.
  const draftsIdx = rel.indexOf('drafts')
  if (draftsIdx !== -1 && rel[draftsIdx + 1] && rel[draftsIdx + 2]) {
    const line = rel[draftsIdx + 1]
    const slug = rel[draftsIdx + 2].replace(/\.[^.]+$/, '')
    if (line && slug) {
      return { line, comicId: `${line}__${slug}` }
    }
  }

  // line = first segment of the rel path (e.g. `biographies`, `indic`).
  scope.line = rel[0]

  // subject after `_books/{subject}` (biographies) …
  const booksIdx = rel.indexOf('_books')
  if (booksIdx !== -1 && rel[booksIdx + 1]) {
    scope.subject = rel[booksIdx + 1]
    return scope
  }

  // … or after `characters/{name}` (Indic and similar).
  const charsIdx = rel.indexOf('characters')
  if (charsIdx !== -1 && rel[charsIdx + 1]) {
    scope.subject = rel[charsIdx + 1]
    return scope
  }

  // … or after `_comics/{subject?}` (subject is the segment BEFORE `_comics`).
  const comicsIdx = rel.indexOf('_comics')
  if (comicsIdx > 0) {
    scope.subject = rel[comicsIdx - 1]
    return scope
  }

  // research/{line}/…/core/… (epic-shared research): line only, no subject.
  // For `research/` we still have a usable line scope (a line grant covers it).
  if (top === 'research') {
    return scope
  }

  // images/ + artifacts/ with no attributable subject AND no draft/_books/
  // /characters marker → can't be safely attributed → deny (fail-closed).
  return {}
}

/**
 * Read a member's allocation doc (`allocations/{email}`). Returns the three
 * grant arrays (missing fields default to `[]`), or `null` if the doc is absent.
 */
export async function getAllocation(email: string): Promise<Allocation | null> {
  const snap = await getFirestore().collection('allocations').doc(email).get()
  if (!snap.exists) return null
  const data = (snap.data?.() ?? {}) as {
    lines?: unknown
    figures_effective?: unknown
    comics?: unknown
  }
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return {
    lines: arr(data.lines),
    figures_effective: arr(data.figures_effective),
    comics: arr(data.comics),
  }
}

/**
 * Read `comics/{comicId}` → its `subject_slug`, or `null` if the doc is absent
 * or the field is missing. Used to resolve a DRAFT key's subject (the path
 * carries the comicId + line but not the subject).
 */
export async function comicSubject(comicId: string): Promise<string | null> {
  const snap = await getFirestore().collection('comics').doc(comicId).get()
  if (!snap.exists) return null
  const data = (snap.data?.() ?? {}) as { subject_slug?: unknown }
  return typeof data.subject_slug === 'string' ? data.subject_slug : null
}

/**
 * Decide whether a member with allocation `alloc` may fetch the R2 object `key`.
 *
 * Allow when ANY grant matches the key's scope:
 *   - `alloc.comics` includes `scope.comicId`   (draft keys), OR
 *   - `alloc.lines` includes `scope.line`,       OR
 *   - `alloc.figures_effective` includes `scope.subject`.
 *
 * For a DRAFT key the subject isn't in the path, so when the line/comic grants
 * don't already allow it we look up the comic's subject (one extra read) and
 * test that against `figures_effective`.
 *
 * Fail-closed: empty scope `{}` → deny; missing `alloc` → deny.
 * Read budget: 0 extra reads for non-draft keys; ≤1 extra (the comic doc) for
 * draft keys, and only when line/comic grants didn't already allow.
 */
export async function isKeyAllowedForMember(
  key: string,
  alloc: Allocation | null,
  deps: AllocationDeps = { comicSubject }
): Promise<boolean> {
  if (!alloc) return false
  const scope = scopeOfKey(key)
  // Empty scope → unattributable → deny.
  if (!scope.line && !scope.subject && !scope.comicId) return false

  // comic-id grant (draft keys carry a comicId).
  if (scope.comicId && alloc.comics.includes(scope.comicId)) return true
  // line grant.
  if (scope.line && alloc.lines.includes(scope.line)) return true
  // figure grant (subject straight from the path, when present).
  if (scope.subject && alloc.figures_effective.includes(scope.subject)) {
    return true
  }

  // Draft key with no subject in the path: resolve the comic's subject and test
  // it against the figure grants ("research follows per-comic": a figure grant
  // unlocks that figure's comics too).
  if (scope.comicId && !scope.subject && alloc.figures_effective.length > 0) {
    const subject = await deps.comicSubject(scope.comicId)
    if (subject && alloc.figures_effective.includes(subject)) return true
  }

  return false
}

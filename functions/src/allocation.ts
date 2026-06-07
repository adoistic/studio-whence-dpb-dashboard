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
  /** `docs/methodology/…` → readable by ANY authed member (no allocation needed). */
  methodology?: boolean
}

/** A member's allocation grants. Missing fields default to empty arrays.
 *
 * `figures` is the RAW explicit figure grants; `figures_effective` is
 * `figures ∪ subjects-of-granted-comics`. COMIC access (draft/comic/image-comic
 * keys) tests RAW `figures`; RESEARCH access tests `figures_effective`. A single
 * comic grant must unlock the figure's research library but NOT its sibling comics. */
export interface Allocation {
  lines: string[]
  figures: string[]
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

  // ── docs/… (client-facing handoff docs) ─────────────────────────────────
  //   docs/methodology/…                       → methodology (any authed member)
  //   docs/comics/{line}/{subject}/{slug}/…     → that comic's allocation
  //     (subject is IN the path, so no comic-doc lookup is needed).
  if (top === 'docs') {
    if (parts[1] === 'methodology') return { methodology: true }
    if (parts[1] === 'comics') {
      const line = parts[2]
      const subject = parts[3]
      const slug = parts[4]
      if (line && subject && slug) {
        return { line, subject, comicId: `${line}__${slug}` }
      }
    }
    return {}
  }

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

  // ── images/comics/{line}/{slug}/… (rendered comic cover + pages) ─────────
  // The reader/PDF read these gated keys. `comics` (no underscore) is distinct
  // from the `_comics` research marker handled below.
  if (rel[0] === 'comics' && rel[1] && rel[2]) {
    const line = rel[1]
    const slug = rel[2]
    return { line, comicId: `${line}__${slug}` }
  }

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
 * Read a member's allocation doc (`allocations/{email}`). Returns the four
 * grant arrays (missing fields default to `[]`), or `null` if the doc is absent.
 */
export async function getAllocation(email: string): Promise<Allocation | null> {
  const snap = await getFirestore().collection('allocations').doc(email).get()
  if (!snap.exists) return null
  const data = (snap.data?.() ?? {}) as {
    lines?: unknown
    figures?: unknown
    figures_effective?: unknown
    comics?: unknown
  }
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return {
    lines: arr(data.lines),
    figures: arr(data.figures),
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
 * Two scope shapes with DIFFERENT figure-grant semantics:
 *
 *   - COMIC-keyed scope (carries `comicId` — draft / image-comic keys): allow if
 *       `alloc.comics` includes `scope.comicId`, OR
 *       `alloc.lines`  includes `scope.line`,    OR
 *       RAW `alloc.figures` includes the comic's subject (looked up from the
 *       comic doc when not in the path). A comic grant unlocks that comic only —
 *       it must NOT cascade to the figure's sibling comics via figures_effective.
 *
 *   - RESEARCH scope (carries `subject`, no `comicId`): allow if
 *       `alloc.lines` includes `scope.line`, OR
 *       `alloc.figures_effective` includes `scope.subject` (so a comic grant
 *       unlocks the figure's research library).
 *
 * Fail-closed: empty scope `{}` → deny; missing `alloc` → deny.
 * Read budget: 0 extra reads for non-comic keys; ≤1 extra (the comic doc) for
 * comic keys, and only when line/comic grants didn't already allow.
 */
export async function isKeyAllowedForMember(
  key: string,
  alloc: Allocation | null,
  deps: AllocationDeps = { comicSubject }
): Promise<boolean> {
  if (!alloc) return false
  const scope = scopeOfKey(key)
  // Methodology docs are readable by ANY authed member — no allocation needed.
  // (Checked BEFORE the empty-scope guard, since this scope carries no
  // line/subject/comicId.)
  if (scope.methodology) return true
  // Empty scope → unattributable → deny.
  if (!scope.line && !scope.subject && !scope.comicId) return false

  // ── COMIC-keyed scope (carries a comicId): RAW `figures`, not figures_effective ──
  if (scope.comicId) {
    if (alloc.comics.includes(scope.comicId)) return true
    if (scope.line && alloc.lines.includes(scope.line)) return true
    // docs/comics keys carry the subject IN the path → test RAW figures with no
    // Firestore read. (Draft keys, where the subject is NOT in the path, still
    // fall through to the comic-doc lookup below.)
    if (scope.subject && alloc.figures.includes(scope.subject)) return true
    // Comic key with no subject in the path: resolve the comic's subject and
    // test it against the RAW figure grants (an explicit figure grant unlocks
    // all of that figure's comics; a sibling comic grant does NOT).
    if (alloc.figures.length > 0) {
      const subject = await deps.comicSubject(scope.comicId)
      if (subject && alloc.figures.includes(subject)) return true
    }
    return false
  }

  // ── RESEARCH scope (subject from a research path): figures_effective ──
  if (scope.line && alloc.lines.includes(scope.line)) return true
  if (scope.subject && alloc.figures_effective.includes(scope.subject)) {
    return true
  }

  return false
}

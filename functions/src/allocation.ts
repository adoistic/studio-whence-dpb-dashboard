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
 *      belongs to (`{ line?, subject?, comicId?, character? }`). No I/O.
 *   2. `getAllocation` / `comicMeta` / `figureProgram` / `castIndex` /
 *      `isKeyAllowedForMember` — the Firestore reads + the allow decision.
 *      Fail-closed: an unattributable scope, a missing allocation doc, or an
 *      empty scope all DENY.
 *
 * Two key shapes are decided differently from the rest:
 *   - CHARACTER SHEETS, `artifacts/characters/{line}/{id}/…` (full sheet
 *     `{stage}.png`, thumbnail `web/{stage}.jpg`; `line` is `shared` for
 *     studio / Diamond IP such as Little Chanakya) → `{ line, character }`. A
 *     character belongs to no single comic, so a member may presign its sheets
 *     when they hold the line (never the `shared` pseudo-line), or when they
 *     may see ANY comic that stages the character. Which comics stage it comes
 *     from the function-only gate index `castIndex/{line}` (firestore.rules
 *     denies every client read of it), written by the content repo's
 *     `tools/publish_work_casts.py` beside the per-comic `casts/*` docs.
 *   - RESEARCH BUNDLES, `bundles/research/{line}/{figure}/…` (one source as
 *     `.md` or `.zip`, or the figure's whole library as `all.zip`) → the
 *     research scope `{ line, subject: figure }`, decided exactly like that
 *     figure's `research/…` keys. Every other `bundles/…` shape → `{}` (deny).
 *
 * Read budget: the allocation doc is read ONCE per request (in `index.ts`) and
 * passed in here. Only a comic key triggers a second read (the comic doc, to
 * learn its subject/program for the figure/program-grant tests) and only a
 * research key with a program grant triggers a figure-doc read. So ≤2
 * Firestore reads per key. A character key reads `castIndex/{line}` only when
 * no line grant already allows it, and that read is cached per instance (5 min
 * when found, 1 min when absent, one shared in-flight read per line), so a
 * `/resolve` batch of 50 thumbnails costs at most one index read per line.
 */

import { getFirestore } from 'firebase-admin/firestore'

/** The work scope an R2 key belongs to. Any field may be absent. An empty
 * object means "could not be attributed" → a member is denied (fail-closed). */
export interface KeyScope {
  line?: string
  subject?: string
  comicId?: string
  /** `artifacts/characters/{line}/{id}/…` → the character id. Always paired
   * with `line`; decided through `castIndex/{line}`, never by the research or
   * comic branches. */
  character?: string
  /** `docs/methodology/…` → readable by ANY authed member (no allocation needed). */
  methodology?: boolean
}

/** `castIndex/{line}` — the gate index for that line's character sheets.
 *
 * `comics` maps each comicId (`{line}__{slug}`) to its subject (`s`) and
 * program (`p`) slugs; `chars` maps each character id to the comicIds that
 * stage it. For the `shared` pseudo-line the comicIds span every line. */
export interface CastIndex {
  comics: Record<string, { s?: string | null; p?: string | null }>
  chars: Record<string, string[]>
}

/** A member's allocation grants. Missing fields default to empty arrays.
 *
 * `figures` is the RAW explicit figure grants; `figures_effective` is
 * `figures ∪ subjects-of-granted-comics`. COMIC access (draft/comic/image-comic
 * keys) tests RAW `figures`; RESEARCH access tests `figures_effective`. A single
 * comic grant must unlock the figure's research library but NOT its sibling comics.
 *
 * `programs` mirrors the Firestore rules' program grant: it unlocks every
 * comic + figure whose `program_slug` matches — current AND future. */
export interface Allocation {
  lines: string[]
  figures: string[]
  figures_effective: string[]
  comics: string[]
  programs: string[]
}

/** Injectable Firestore readers so the allow logic is unit-testable without a
 * live Admin SDK. All three default to the real Firestore in
 * `isKeyAllowedForMember`. */
export interface AllocationDeps {
  comicMeta: (comicId: string) => Promise<{ subject: string | null; program: string | null }>
  figureProgram: (slug: string) => Promise<string | null>
  /** The line's cast index, or `null` when it is absent. */
  castIndex: (line: string) => Promise<CastIndex | null>
}

/** The pseudo-line holding studio / Diamond IP characters (Little Chanakya and
 * his cast). Nobody is granted it as a line: its sheets are reachable only
 * through the comics that stage them. */
const SHARED_CAST_LINE = 'shared'

/**
 * Parse an R2 object key into the work scope it belongs to. PURE — no I/O.
 *
 * Shapes (verified against the publish pipeline):
 *   - `drafts/{line}/{slug}.html`
 *       → { comicId: `{line}__{slug}`, line }. Subject is NOT in the path; it
 *         must be looked up from the comic doc (done in isKeyAllowedForMember).
 *   - `panels/{line}/{slug}.json` (Panels-view page model)
 *       → same shape/resolution as `drafts/{line}/{slug}.html` above, so it
 *         maps to the identical comicId as that comic's draft.
 *   - `research/{rel}` where `rel` is a repo-relative POSIX path:
 *       biographies: `research/biographies/NN-…/_books/{subject}/…`
 *         → line = first segment after `research/`; subject = segment after `_books/`.
 *       indic/other: `research/indic/<Epic>/characters/{name}/…` or `…/core/…`
 *         → line = first segment after `research/`; subject = segment after
 *           `characters/` if present, else none.
 *   - `bundles/research/{line}/{figure}/{file…}` (pre-built research downloads)
 *       → { line, subject: figure } — a RESEARCH scope, no comicId. Any other
 *         `bundles/…` shape, or one missing the line, figure or file segment
 *         → `{}` (deny).
 *   - `artifacts/characters/{line}/{id}/{file…}` (character sheets and their
 *       `web/` thumbnails) → { line, character: id }. Matched before the
 *       generic `characters/{name}` marker below; missing the line, the id or
 *       the file segment → `{}` (deny).
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

  // ── sites/… (gated self-contained micro-sites, e.g. the Medikidz comic
  //   analysis embed) → readable by ANY allowlisted member (same tier as
  //   methodology/research docs). No allocation needed. ────────────────────
  if (top === 'sites') return { methodology: true }

  // ── docs/… (client-facing handoff docs) ─────────────────────────────────
  //   docs/methodology/…                       → methodology (any authed member)
  //   docs/comics/{line}/{subject}/{slug}/…     → that comic's allocation
  //     (subject is IN the path, so no comic-doc lookup is needed).
  if (top === 'docs') {
    if (parts[1] === 'methodology') return { methodology: true }
    // docs/research/{line}/…  → line-level research library, readable by ANY
    // allowlisted member (same tier as methodology). The line is in the path but
    // access does NOT depend on it — any authed member may read research docs.
    if (parts[1] === 'research' && parts[2]) return { methodology: true }
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

  // ── panels/{line}/{slug}.json (Panels-view page model) ───────────────────
  //   Same shape as drafts/{line}/{slug}.html above, so it resolves to the
  //   SAME comicId as that comic's draft — a comic/line/figure/program grant
  //   that unlocks the draft unlocks its panel model too, nothing wider.
  if (top === 'panels') {
    const line = parts[1]
    const file = parts[2]
    if (!line || !file) return {}
    const slug = file.replace(/\.json$/i, '')
    if (!slug) return {}
    return { line, comicId: `${line}__${slug}` }
  }

  // ── bundles/research/{line}/{figure}/… (pre-built research downloads) ────
  //   `sources/{source}.md`, `sources/{source}.zip` or `all.zip`. A RESEARCH
  //   scope (no comicId), so the research branch of isKeyAllowedForMember
  //   decides it exactly as it decides the figure's `research/…` keys: a line
  //   grant, figures_effective, or a program grant through figureProgram.
  //   `bundles` is a top-level prefix of its own and is matched here, before
  //   the shared rel-path markers below can misread it. Every other shape —
  //   another bundle kind, a missing line/figure/file segment, the
  //   `bundles/research/_state.json` bookkeeping file — is `{}` (deny).
  if (top === 'bundles') {
    if (parts[1] === 'research' && parts.length >= 5) {
      return { line: parts[2], subject: parts[3] }
    }
    return {}
  }

  // ── research / images / artifacts / … shared rel-path parsing ───────────
  // `rel` is everything after the top-level bucket prefix.
  const rel = parts.slice(1)
  if (rel.length === 0) return {}

  // ── artifacts/characters/{line}/{id}/… (character sheets) ────────────────
  //   `{stage}.png` is the full sheet, `web/{stage}.jpg` its thumbnail; `line`
  //   is `shared` for studio / Diamond IP. Matched BEFORE the generic
  //   `characters/{name}` marker below, which would read this shape as
  //   `{ line: 'characters', subject: <line> }` — the parse that refused every
  //   member all character art. Requires the line, the id AND a file segment
  //   after them; anything shorter is `{}` (deny).
  if (top === 'artifacts' && rel[0] === 'characters') {
    if (rel.length >= 4) return { line: rel[1], character: rel[2] }
    return {}
  }

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

  // … or after `Practical-Indic/{subject}` (the Practical Indic program). The
  // repo path is capitalised `Indic/Practical-Indic/{subject}/…`, but the line
  // slug is `indic`, so normalise the line here too.
  const piIdx = rel.indexOf('Practical-Indic')
  if (piIdx !== -1 && rel[piIdx + 1]) {
    scope.line = 'indic'
    scope.subject = rel[piIdx + 1]
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
    programs?: unknown
  }
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return {
    lines: arr(data.lines),
    figures: arr(data.figures),
    figures_effective: arr(data.figures_effective),
    comics: arr(data.comics),
    programs: arr(data.programs),
  }
}

/**
 * Read `comics/{comicId}` → its `subject_slug` + `program_slug` in ONE read
 * (either may be `null` when the doc/field is absent). Used to resolve a comic
 * key's subject/program for the figure/program grant tests (the path carries
 * the comicId + line but not the subject or program).
 */
export async function comicMeta(
  comicId: string
): Promise<{ subject: string | null; program: string | null }> {
  const snap = await getFirestore().collection('comics').doc(comicId).get()
  if (!snap.exists) return { subject: null, program: null }
  const data = (snap.data?.() ?? {}) as { subject_slug?: unknown; program_slug?: unknown }
  return {
    subject: typeof data.subject_slug === 'string' ? data.subject_slug : null,
    program: typeof data.program_slug === 'string' ? data.program_slug : null,
  }
}

/**
 * Read `figures/{slug}` → its `program_slug`, or `null` when the doc/field is
 * absent. Used by the RESEARCH branch so a program grant unlocks its figures'
 * research libraries (mirrors the rules' `figureResearchAllowed`).
 */
export async function figureProgram(slug: string): Promise<string | null> {
  const snap = await getFirestore().collection('figures').doc(slug).get()
  if (!snap.exists) return null
  const data = (snap.data?.() ?? {}) as { program_slug?: unknown }
  return typeof data.program_slug === 'string' ? data.program_slug : null
}

// ── castIndex/{line} — read once, then reused per instance ──────────────────

/** A found index is reused for 5 minutes before it is read again. */
const CAST_INDEX_TTL_MS = 5 * 60 * 1000
/** An absent index is remembered as absent for 1 minute. */
const CAST_INDEX_MISS_TTL_MS = 60 * 1000
/** At most this many lines are held at once. The line comes from the
 * requested key, so this bounds what a stream of made-up lines can occupy. */
const CAST_INDEX_CACHE_MAX = 64
/** Only a plausible document id is ever read. This keeps '.', reserved
 * `__…__` ids and absurd lengths away from Firestore; such a line has no
 * index, which denies. */
const CAST_INDEX_LINE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/

interface CastIndexCacheEntry {
  value: Promise<CastIndex | null>
  expiresAt: number
}

const castIndexCache = new Map<string, CastIndexCacheEntry>()

/** Drop every cached cast index. For tests, and for forcing a re-read. */
export function clearCastIndexCache(): void {
  castIndexCache.clear()
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Make room before an insert: expired entries go first, then the oldest. */
function pruneCastIndexCache(now: number): void {
  if (castIndexCache.size < CAST_INDEX_CACHE_MAX) return
  for (const [line, entry] of castIndexCache) {
    if (entry.expiresAt <= now) castIndexCache.delete(line)
  }
  while (castIndexCache.size >= CAST_INDEX_CACHE_MAX) {
    const oldest = castIndexCache.keys().next().value
    if (oldest === undefined) break
    castIndexCache.delete(oldest)
  }
}

/** One Firestore read of `castIndex/{line}`, coerced to the CastIndex shape
 * (a non-object `comics` / `chars` becomes `{}`; entries are re-checked where
 * they are used). `null` when the doc is absent. */
async function readCastIndex(line: string): Promise<CastIndex | null> {
  const snap = await getFirestore().collection('castIndex').doc(line).get()
  if (!snap.exists) return null
  const data = (snap.data?.() ?? {}) as { comics?: unknown; chars?: unknown }
  return {
    comics: isRecord(data.comics) ? (data.comics as CastIndex['comics']) : {},
    chars: isRecord(data.chars) ? (data.chars as CastIndex['chars']) : {},
  }
}

/**
 * Read `castIndex/{line}` → the line's CastIndex, or `null` when absent.
 *
 * Cached in module memory per line: a found index for 5 minutes, an absent one
 * for 1 minute. Concurrent callers share ONE in-flight read, which matters
 * because `/resolve` checks up to 50 keys in parallel. A read that throws is
 * not cached — the callers waiting on it deny, and the next request retries.
 */
export function castIndex(line: string): Promise<CastIndex | null> {
  if (typeof line !== 'string' || !CAST_INDEX_LINE_RE.test(line)) {
    return Promise.resolve(null)
  }
  const now = Date.now()
  const hit = castIndexCache.get(line)
  if (hit && hit.expiresAt > now) return hit.value
  if (hit) castIndexCache.delete(line)
  pruneCastIndexCache(now)

  // In flight: the TTL is a placeholder that keeps concurrent callers on this
  // one read; the real expiry is set when the read settles.
  const entry: CastIndexCacheEntry = {
    value: Promise.resolve(null),
    expiresAt: now + CAST_INDEX_TTL_MS,
  }
  entry.value = readCastIndex(line).then(
    (index) => {
      entry.expiresAt = Date.now() + (index ? CAST_INDEX_TTL_MS : CAST_INDEX_MISS_TTL_MS)
      return index
    },
    (err: unknown) => {
      if (castIndexCache.get(line) === entry) castIndexCache.delete(line)
      throw err
    }
  )
  castIndexCache.set(line, entry)
  return entry.value
}

/**
 * The CHARACTER branch of `isKeyAllowedForMember` (members only; moderators
 * never reach this module).
 *
 *   1. A grant on the character's own line allows — that covers the line's
 *      library sheets too. The `shared` pseudo-line is never matched this way.
 *   2. Otherwise read `castIndex/{line}` and allow when the member may see ANY
 *      comic that stages the character, each comic tested the way
 *      `comicAllowed` in firestore.rules tests it: the comic id, the comic's
 *      own line (the part of the id before `__`), its subject against RAW
 *      `figures`, its program against `programs`.
 *   3. Otherwise deny — also on a missing index, an unknown character, a
 *      malformed entry, or a read that throws.
 */
async function isCharacterAllowedForMember(
  line: string | undefined,
  character: string,
  alloc: Allocation,
  deps: AllocationDeps
): Promise<boolean> {
  if (!line || !character) return false
  if (line !== SHARED_CAST_LINE && alloc.lines.includes(line)) return true

  let index: CastIndex | null
  try {
    index = await deps.castIndex(line)
  } catch {
    return false
  }
  if (!index || !isRecord(index.chars) || !Object.hasOwn(index.chars, character)) {
    return false
  }
  const comicIds: unknown = index.chars[character]
  if (!Array.isArray(comicIds)) return false
  const comics = isRecord(index.comics) ? index.comics : {}

  for (const comicId of comicIds) {
    if (typeof comicId !== 'string' || comicId.length === 0) continue
    if (alloc.comics.includes(comicId)) return true
    const sep = comicId.indexOf('__')
    const comicLine = sep > 0 ? comicId.slice(0, sep) : ''
    if (comicLine && alloc.lines.includes(comicLine)) return true
    const meta: unknown = Object.hasOwn(comics, comicId) ? comics[comicId] : undefined
    if (!isRecord(meta)) continue
    if (typeof meta.s === 'string' && meta.s && alloc.figures.includes(meta.s)) return true
    if (typeof meta.p === 'string' && meta.p && alloc.programs.includes(meta.p)) return true
  }
  return false
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
 *       comic doc when not in the path), OR
 *       `alloc.programs` includes the comic's `program_slug` (same comic-doc
 *       lookup). A comic grant unlocks that comic only — it must NOT cascade
 *       to the figure's sibling comics via figures_effective.
 *
 *   - RESEARCH scope (carries `subject`, no `comicId`): allow if
 *       `alloc.lines` includes `scope.line`, OR
 *       `alloc.figures_effective` includes `scope.subject` (so a comic grant
 *       unlocks the figure's research library), OR
 *       `alloc.programs` includes the figure's `program_slug` (figure-doc
 *       lookup; mirrors the rules' figureResearchAllowed). Research bundles
 *       (`bundles/research/{line}/{figure}/…`) take this branch.
 *
 *   - CHARACTER scope (carries `character`): a grant on the character's line
 *       (never `shared`), else any comic that stages it per `castIndex/{line}`
 *       — see isCharacterAllowedForMember.
 *
 * Fail-closed: empty scope `{}` → deny; missing `alloc` → deny.
 * Read budget: ≤1 extra read (the comic doc for comic keys, the figure doc for
 * research keys, the cached cast index for character keys), and only when the
 * cheap list grants didn't already allow.
 */
export async function isKeyAllowedForMember(
  key: string,
  alloc: Allocation | null,
  deps: AllocationDeps = { comicMeta, figureProgram, castIndex }
): Promise<boolean> {
  if (!alloc) return false
  const scope = scopeOfKey(key)
  // Methodology docs are readable by ANY authed member — no allocation needed.
  // (Checked BEFORE the empty-scope guard, since this scope carries no
  // line/subject/comicId.)
  if (scope.methodology) return true
  // Empty scope → unattributable → deny.
  if (!scope.line && !scope.subject && !scope.comicId) return false

  // ── CHARACTER scope (a character sheet): decided by the cast index ──
  // Checked BEFORE the comic/research branches, which know nothing of the
  // cast index (and whose line test would let a `shared` line grant through).
  if (scope.character !== undefined) {
    return isCharacterAllowedForMember(scope.line, scope.character, alloc, deps)
  }

  // ── COMIC-keyed scope (carries a comicId): RAW `figures`, not figures_effective ──
  if (scope.comicId) {
    if (alloc.comics.includes(scope.comicId)) return true
    if (scope.line && alloc.lines.includes(scope.line)) return true
    // docs/comics keys carry the subject IN the path → test RAW figures with no
    // Firestore read. (Draft keys, where the subject is NOT in the path, still
    // fall through to the comic-doc lookup below.)
    if (scope.subject && alloc.figures.includes(scope.subject)) return true
    // Comic key with subject not (or not conclusively) in the path: ONE
    // comic-doc read resolves both the subject (tested against RAW figures —
    // an explicit figure grant unlocks all of that figure's comics; a sibling
    // comic grant does NOT) and the program_slug (tested against `programs` —
    // a program grant unlocks the whole series, current & future).
    if (alloc.figures.length > 0 || alloc.programs.length > 0) {
      const meta = await deps.comicMeta(scope.comicId)
      if (meta.subject && alloc.figures.includes(meta.subject)) return true
      if (meta.program && alloc.programs.includes(meta.program)) return true
    }
    return false
  }

  // ── RESEARCH scope (subject from a research path): figures_effective ──
  if (scope.line && alloc.lines.includes(scope.line)) return true
  if (scope.subject && alloc.figures_effective.includes(scope.subject)) {
    return true
  }
  // Program grant → the figure's research library (figure-doc lookup, only
  // when the cheap grants above didn't already allow).
  if (scope.subject && alloc.programs.length > 0) {
    const program = await deps.figureProgram(scope.subject)
    if (program && alloc.programs.includes(program)) return true
  }

  return false
}

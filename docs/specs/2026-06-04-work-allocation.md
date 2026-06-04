# Work Allocation — design spec

> by Adnan / Studio Whence · 2026-06-04
>
> Per-work access control for the DPB editorial dashboard. The admin assigns
> specific works to specific people; a member sees only what they're assigned.
> Bundled into the same cutover as the roles + draft-approval feature
> (`feat/roles-approval`).

## Decisions (locked with Adnan)
- **Allocate at three levels** — line, figure/subject, or individual comic. Effective access = the **union** of all grants. UI must make the three levels clear.
- **Admin + the 4 sub-admins always see everything.** Allocation restricts only regular **members**. (`isSubAdmin()` bypasses every allocation gate.)
- **Research follows per-comic** — a single-comic grant unlocks that comic's figure's **full** research library (not just the inline-cited lines).
- **One combined cutover** — nothing deploys until allocation is built + reviewed alongside the roles feature.
- Only **admin** writes allocations.

## Data model — `allocations/{email}` (one doc per member, email lowercased)
```
{
  lines:            ["biographies", …],            // raw line grants
  figures:          ["sachin-tendulkar", …],        // raw figure (subject_slug) grants
  comics:           ["biographies__01-…", …],        // raw comic-id grants
  figures_effective:["sachin-tendulkar", …],         // = figures ∪ { subject_slug(c) : c ∈ comics }
  updatedBy, updatedAt
}
```
`figures_effective` is **derived by the admin UI on every write** (it has the comic catalog loaded, so it maps each granted comic-id → its `subject_slug`). The rules read only `lines`, `comics`, `figures_effective`; the UI renders chips from the raw `lines`/`figures`/`comics`. Storing raw + derived keeps the rules a single cheap `get()` with scalar `hasAny()` and no comic→figure parsing, while still satisfying "research follows per-comic".

## Enforcement layer 1 — Firestore rules
`comics/{c}` doc id is `{line}__{slug}`; the doc carries `line` and `subject_slug`.
```
function allocDoc()   { return get(/…/allocations/$(userEmail())).data; }
function hasAlloc()   { return exists(/…/allocations/$(userEmail())); }
function comicAllowed(cid, line, subject) {
  return isSubAdmin() || (hasAlloc() && (
       allocDoc().comics.hasAny([cid])
    || allocDoc().lines.hasAny([line])
    || allocDoc().figures_effective.hasAny([subject]) ));
}
function figureResearchAllowed(fline, fslug) {
  return isSubAdmin() || (hasAlloc() && (
       allocDoc().lines.hasAny([fline])
    || allocDoc().figures_effective.hasAny([fslug]) ));
}
```
- `comics/{c}` read: `isAllowlisted() && comicAllowed(c, resource.data.line, resource.data.subject_slug)`; same for `comics/{c}/versions/{v}` (gate on the parent — re-read the comic via `get()` or replicate by storing line/subject on the version; simplest: `get(/comics/$(c))` is unavailable from the subcollection wildcard, so store `line`/`subject_slug` on version docs at publish OR gate versions by `comicAllowed` using a `get` on the parent comic doc). Pick whichever the implementer verifies works; versions already carry `comicId`-equivalent context.
- `figures/{f}` + `figures/{f}/sources/{s}` read: `isAllowlisted() && figureResearchAllowed(resource.data.line, f)` (figure doc id `f` is the subject_slug; confirm the field).
- `lines/{d}`, `meta/{d}`, `people/{p}` stay `isAllowlisted()` read (navigation/structure only; no IP content).
- `allocations/{email}`: `allow read: if isSignedIn() && (userEmail() == email || isAdmin()); allow write: if isAdmin();`
- A member with **no** allocation doc → `hasAlloc()` false → sees no comics/research (correct).

## Enforcement layer 2 — Cloud Function `dataApi` (R2 content) — THE load-bearing gate
Without this a member could pull a comic's draft straight from `/resolve`+`/read` even if the dashboard hides the tile. `functions/src/auth.ts authorize()` already returns `{email}` on allow. Add, in `index.ts` per-key (after `safeKey`), an **allocation check** for members (admin/sub_admin bypass):
- Resolve the caller's role: admin (env) or `allowlist/{email}.role == 'sub_admin'` → bypass. Otherwise read `allocations/{email}` once per request.
- Map each R2 key → scope:
  - `drafts/{line}/{slug}.html` → comicId `{line}__{slug}`, `line`; look up `comics/{comicId}` for `subject_slug`. Allow if `comics.hasAny(comicId) || lines.hasAny(line) || figures_effective.hasAny(subject)`.
  - `research/{line}/…/_books/{subject}/…` (biographies) → `line` = first path segment, `subject` = segment after `_books/`. Allow if `lines.hasAny(line) || figures_effective.hasAny(subject)`. (Indic/others: `characters/{name}` or `core/` — parse subject after `characters/`, else fail-closed; research not started there yet.)
  - `images/…` / `artifacts/…` → parse the same way (`_books/{subject}`, `drafts/{line}/{slug}`, or `_comics`); if the scope can't be attributed, **deny** for members (fail-closed). Shared brand art is bundled in the app, not fetched from R2.
- Drop disallowed keys in `/resolve` (like invalid keys are dropped); `403` in `/read`. Keep failing closed on any error.

## Enforcement layer 3 — dashboard read path (UX; the rules are the real guard)
Firestore rejects a whole collection scan if any matched doc is unreadable, so a **member must not scan `comics`**. New `useVisibleComics(viewerCanModerate, email)`:
- **moderator** → existing full `getDocs(collection('comics'))` scan (unchanged).
- **member** → read `allocations/{email}`, then run **one query per grant**, each aligned to a rule-honored predicate, and union+dedupe by id:
  - `where('line','in', lines)` (chunk ≤30),
  - `where('subject_slug','in', figures_effective)` (chunk ≤30),
  - `where(documentId(),'in', comics)` (chunk ≤30).
  - No allocation doc / all-empty → empty set.
- Home/line/figure pages render only the visible set; lines/figures with zero visible comics drop from that member's nav/home.

## Admin UI — new "Allocations" section in `/admin`
Pick a member (from the existing members list) → show current grants as chips grouped **Line / Figure / Comic** → add via **cascading pickers** (line → figure → comic, sourced from the catalog) → remove via chip ×. On every change, write the allocation doc with raw grants + derived `figures_effective`. Admin-only (the page already self-guards).

## Indexes
Member queries need single-field indexes on `comics.line`, `comics.subject_slug` (auto) and the `documentId() in` (no index needed). Add composites only if a query also orders — these are unordered `in` filters, so single-field automatic indexes suffice. Verify at build; add to `firestore.indexes.json` if the emulator/console demands.

## Carryover from the roles review (fold in before cutover)
- **Replies inherit parent** — `addReply` writes `published` = parent's published; the create rule lets a non-moderator post a reply with `published==true` **only** when the parent doc is published (`get()` on parent). Roots stay forced-draft for members.
- **Category invariant (M2)** — pin `category` in the feedback author-update rule so a member can't mutate it post-hoc.

## Build order (subagent-driven, each with spec + quality review)
WA0 carryover fixes → WA1 rules+indexes → WA2 allocation lib → WA3 member-aware reads + page gating → WA4 admin Allocations UI → WA5 function gate → combined cutover (backfill published, seed 4 sub-admins + Ankit member, deploy indexes→hosting→rules→functions, merge both repos).

# Idea Drop — design spec

**Date:** 2026-06-08
**Author:** Adnan / Studio Whence
**Status:** Approved (brainstorming) — pending implementation plan
**Repo:** `adoistic/studio-whence-dpb-dashboard` (dashboard, **public, code-only**) + a retrieval script in the content repo `adoistic/dpb-comic-source-library` (private).

---

## 1. Problem & goal

Admins currently send Adnan product ideas over WhatsApp, which is impossible to track,
search, or act on. **Idea Drop** replaces that with an in-app idea inbox on the editorial
dashboard:

- An admin/sub-admin composes a rough idea — paste anything (rich text from WhatsApp,
  email, Google Docs), drop in images — and addresses it.
- The idea always reaches Adnan, and optionally a wider audience.
- Everything is organised by date, triage-able in-app, and **copy-pasteable back out with
  rich formatting and images intact**.
- Adnan pulls the whole collection into a local Claude Code session (via an export script)
  to read, categorise, and find patterns. No fixed taxonomy is imposed up front.

**Explicitly out of scope (decided during brainstorming):** email notifications, any new
API key / email-sending service, automated summarisation or digests, an in-app
fixed-category picker, threaded discussion/replies on an idea.

---

## 2. Constraints & context

- **Stack:** Next.js static export → Firebase Hosting. All dynamic data is client-side via
  the Firestore Web SDK; binaries go through R2 behind a single Cloud Function
  (`dataApi`, `functions/src/index.ts`). There is **no server runtime** for app logic — only
  the Cloud Function.
- **The dashboard repo is PUBLIC and holds code only.** No idea data, no images, no exports
  may ever be committed to it. All idea data is served gated at runtime (Firestore rules +
  the R2 Cloud Function after a Firebase-auth check). This design honours that rule.
- **Firestore hard limit:** 1 MB per document. A single pasted screenshot is often 1–3 MB
  as base64, so base64-in-the-document does not work for real images.
- **Existing roles** (`firestore.rules`): `adnan@thothica.com` = admin/owner;
  `allowlist/{email}.role` ∈ {`sub_admin`, `member`}; `suspended/{email}` excludes a user.
  Helper rule functions already exist: `isAdmin()`, `isSubAdmin()`, `isAllowlisted()`,
  `isSignedIn()`, `userEmail()`.
- **Reusable precedent:** the `feedback` collection (`src/lib/feedback.ts`, `addDoc` +
  `onSnapshot`) is the template for the `ideas` collection. `copyScript.ts` is the precedent
  for clipboard serialization. The R2 resolve/presign flow
  (`functions/src/r2.ts` `presignGet`, the `resolve` route, `src/lib/useResolved.ts`) is the
  precedent for image fetching.
- **The R2 Cloud Function is read-only today** (`presignGet`, `getObject`). Image *upload*
  requires a **new presigned-PUT route**.
- **Currently installed render stack:** `react-markdown` + `remark-gfm`. There is **no rich
  editor, no HTML→Markdown converter, and no HTML sanitizer** — these are new.

---

## 3. Audience & visibility model

- **Who can post:** `admin` (Adnan) and `sub_admin` only. Members never post.
- **Every idea is always visible to Adnan**, automatically — Adnan is an implicit recipient
  of every idea regardless of the chosen visibility.
- **The poster picks exactly one additional audience** (`visibility` field):
  | value | who sees it (always plus Adnan) |
  |---|---|
  | `private` | only Adnan |
  | `all_sub_admins` | every sub-admin |
  | `all_approved` | every allowlisted user, members included |
  | `specific` | a chosen list of emails (`recipients[]`) |
- **Feature visibility:** the `/ideas` route is reachable by any signed-in allowlisted user,
  but each user sees **only the ideas they are a recipient of** (enforced in Firestore rules,
  see §8). The **compose** affordance renders only for admin/sub-admin.
- Members can be recipients (via `all_approved` or `specific`) but can never post — confirmed
  during brainstorming.

---

## 4. Capture & storage — canonical store is Markdown

### 4.1 Editor
- **Tiptap** (ProseMirror-based). Its schema cleans pasted HTML reliably: it keeps headings,
  bold/italic, lists, links, tables, images, blockquotes, code; it **drops text alignment and
  junk inline styles** (alignment is explicitly normalised to default/left per Adnan).
- Extensions: starter-kit, link, image, table (table/row/header/cell). A toolbar is minimal —
  the primary authoring path is paste.

### 4.2 HTML → Markdown on save
- Convert Tiptap HTML → Markdown with **Turndown** + the **turndown GFM plugin** (for
  pipe tables, strikethrough, task lists).
- **Nested / complex tables that Markdown cannot represent fall back to embedded raw HTML**
  inside the Markdown (Markdown permits embedded HTML). The converter detects a table that is
  nested (a table inside a cell) or otherwise non-rectangular and emits the sanitized `<table>`
  HTML for that block instead of a Markdown table.
- **Line breaks:** single newlines are preserved as **hard breaks** (trailing-backslash or
  `<br>`), not collapsed — so the stored Markdown "displays as it was seen".

### 4.3 `ideas/{ideaId}` document (Firestore)
```
author        : string   // poster email (normalized)
authorName    : string   // display name
title         : string?  // optional short title
bodyMarkdown  : string   // canonical; may embed sanitized HTML blocks for nested tables;
                         //   may contain tiny base64 data: image URIs (<50KB) inline and
                         //   r2:// tokens for larger images
r2Images      : [{ token: string, key: string, filename: string, contentType: string }]
visibility    : 'private' | 'all_sub_admins' | 'all_approved' | 'specific'
recipients    : string[] // emails; used only when visibility == 'specific' (Adnan implicit)
status        : 'new' | 'triaged' | 'actioned' | 'archived'   // Adnan-set, default 'new'
tags          : string[] // free-text, Adnan-set, no fixed taxonomy
createdAt     : Timestamp (serverTimestamp)
updatedAt     : Timestamp
editedAt      : Timestamp | null
```

### 4.4 Rendering
- `react-markdown` + `remark-gfm` + **`rehype-raw`** (to render the embedded-HTML table
  fallback) + **`rehype-sanitize`** (mandatory — paste content is arbitrary and untrusted;
  this is the XSS boundary).
- A custom `img` renderer resolves `r2://…` tokens to short-lived presigned GET URLs via the
  existing resolve flow; `data:` URIs render directly.

---

## 5. Images — hybrid storage

Decided: tiny pasted images stay inline; everything else goes to R2.

- **Tiny pasted images (< 50 KB):** inlined as a `data:` base64 URI directly in
  `bodyMarkdown`.
- **Larger pasted images or explicitly attached files:** uploaded to **R2** and referenced by
  an `r2://ideas/<ideaId>/<filename>` token in `bodyMarkdown`, with an entry in `r2Images[]`.
- **Doc-size guard:** the 50 KB threshold plus R2-for-the-rest keeps each Firestore document
  comfortably under the 1 MB cap. The client also rejects a save whose serialized doc would
  exceed a safety margin (e.g. 700 KB) and prompts the user (this should not happen in
  practice given the threshold).

### 5.1 New R2 upload route (Cloud Function)
- Add an authenticated **presigned-PUT** route to `functions/src/index.ts` (alongside
  `content` / `resolve` / `read`):
  - Verify the Firebase ID token (reuse `functions/src/auth.ts`).
  - Authorise: caller must be **admin or sub_admin** (the only posters).
  - Generate a presigned **PUT** URL for key `ideas/<ideaId>/<safeFilename>` (new helper
    `presignPut` in `functions/src/r2.ts`, mirroring `presignGet`), with a constrained
    content-type and a TTL.
  - Return `{ url, key }`. The client PUTs the bytes directly to R2.
- Add `ideas/` to the function's **READ prefixes** so the existing `resolve`/`presignGet`
  path can serve idea images back.
- **R2 bucket CORS** must be extended to allow **PUT** (and the needed headers) from the
  dashboard origins — currently the policy allows GET/HEAD only (see memory
  `reference_r2-bucket-cors-for-browser-fetch`). Apply via `put_bucket_cors`.

---

## 6. Copy-out — rich, self-contained

A **Copy** button on each idea writes a single `ClipboardItem` with two flavours:

- `text/html` — the idea rendered to rich HTML with **every image inlined as base64**
  (R2-hosted images are fetched and base64-encoded at copy time so the pasted result is fully
  self-contained and does not depend on a presigned URL that will expire). Pastes cleanly into
  email, Google Docs, and WhatsApp Web with formatting and images in place.
- `text/plain` — the canonical Markdown.

Implemented with the async Clipboard API (`navigator.clipboard.write([ClipboardItem])`).
Pattern mirrors `src/components/feedback/copyScript.ts`.

---

## 7. Triage & in-app notifications

- **Status** per idea: `new → triaged → actioned → archived`. Adnan sets it from the idea
  view. Default `new`.
- **Tags:** free-text, Adnan-set; no predefined taxonomy (deliberate — the taxonomy is to be
  discovered later via Claude Code).
- **Inbox UI** at `/ideas`: ideas grouped by date (newest first), with filters by status,
  tag, sender, and visibility. Built on the existing dashboard components
  (`DataTable`/panels, `StatusPill`, `DocMarkdown`).
- **Unread indicator (in-app only):** a per-user document `idea_reads/{email}` records the set
  of seen idea IDs (or a `lastSeenAt` + per-id overrides). The nav (`Topbar.tsx`) shows an
  unread-count badge of ideas addressed to the current user that they have not opened. **No
  device push, no email.**

---

## 8. Firestore security rules

New collections, added to `firestore.rules`:

```
match /ideas/{id} {
  // Only admin/sub-admin may create, and only as themselves.
  allow create: if (isAdmin() || isSubAdmin())
                && request.resource.data.author == userEmail();

  // A reader sees an idea if they are admin, the author, or a recipient by visibility.
  allow read: if isAdmin()
              || resource.data.author == userEmail()
              || (resource.data.visibility == 'all_sub_admins' && isSubAdmin())
              || (resource.data.visibility == 'all_approved'   && isAllowlisted())
              || (resource.data.visibility == 'specific'
                    && userEmail() in resource.data.recipients);

  // Author may edit own content; admin may set status/tags or edit anything.
  allow update: if isAdmin() || resource.data.author == userEmail();
  allow delete: if isAdmin() || resource.data.author == userEmail();
}

match /idea_reads/{email} {
  allow read, write: if isSignedIn() && userEmail() == email;
}
```

Notes:
- Adnan is covered everywhere by `isAdmin()`, satisfying "always visible to Adnan".
- All idea content is **sanitized at render** (`rehype-sanitize`); embedded-HTML tables pass
  through a sanitizer allow-list.
- A Firestore composite index is likely needed for inbox queries (e.g.
  `visibility` + `createdAt`, and recipient/author filters); enumerate during planning and add
  to `firestore.indexes.json`.

---

## 9. Retrieval for Claude Code

- A Python script in the **content repo** `tools/` (e.g. `export_ideas.py`) using the existing
  Firebase admin service account (`GOOGLE_APPLICATION_CREDENTIALS=.secrets/firebase-admin.json`,
  pattern from `tools/publish_to_firestore.py`):
  - Reads the `ideas` collection.
  - Writes **dated Markdown files** into a **gitignored** local folder
    (e.g. `_ideas/YYYY-MM-DD/<id>.md`) with front-matter (author, visibility, recipients,
    status, tags, timestamps) and the `bodyMarkdown`.
  - Downloads referenced R2 images next to each file and rewrites `r2://` tokens to local
    relative paths so Claude Code can read images.
- Adnan then categorises / finds patterns in a local Claude Code session. **No write-back to
  the app in v1** (status/tags are set manually in-app; an optional future write-back is
  noted, not built).
- The `_ideas/` folder is added to the content repo `.gitignore` — idea data never enters git.

---

## 10. New dependencies (dashboard repo, code-only)

- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`,
  `@tiptap/extension-image`, `@tiptap/extension-table` (+ row/header/cell)
- `turndown` + `turndown-plugin-gfm`
- `rehype-raw`, `rehype-sanitize`

(All are code; none touch the public-repo data rule.)

---

## 11. Component / file surface (anticipated)

Dashboard:
- `src/app/(authed)/ideas/page.tsx` — inbox + idea view.
- `src/components/ideas/IdeaComposer.tsx` — Tiptap editor + visibility/recipient picker +
  image paste/upload handling.
- `src/components/ideas/IdeaList.tsx`, `IdeaCard.tsx`, `IdeaView.tsx`.
- `src/lib/ideas.ts` — Firestore CRUD + `onSnapshot` hooks (mirrors `feedback.ts`).
- `src/lib/ideaHtmlToMarkdown.ts` — Turndown config + nested-table fallback + hard-break
  handling (pure, unit-tested).
- `src/lib/ideaCopy.ts` — clipboard serialization with base64 image inlining (pure-ish,
  unit-tested with jsdom).
- `src/lib/ideaImages.ts` — paste/attach handling, 50 KB threshold, R2 upload call.
- `Topbar.tsx` — unread badge.
- `functions/src/index.ts` + `functions/src/r2.ts` — presigned-PUT upload route + `presignPut`.
- `firestore.rules`, `firestore.indexes.json` — `ideas` + `idea_reads`.

Content repo:
- `tools/export_ideas.py`, `.gitignore` entry for `_ideas/`.

---

## 12. Testing strategy

- **Pure-logic unit tests (vitest, jsdom):** HTML→Markdown conversion (headings, lists,
  links, simple tables → Markdown, nested tables → embedded HTML, alignment dropped, hard
  breaks preserved); clipboard serialization (HTML flavour with base64-inlined images, plain
  flavour = Markdown); image-threshold routing (<50 KB inline vs R2).
- **Firestore rules tests** (`@firebase/rules-unit-testing`, existing in devDeps): each
  visibility path — author, admin, sub-admin, allowlisted member, specific recipient,
  non-recipient — for read; create restricted to admin/sub-admin; `idea_reads` own-only.
- **Component tests** (`@testing-library/react`): composer renders visibility options per role;
  inbox filters; unread badge count.
- **Cloud Function:** auth/role check on the upload route; `presignPut` key-safety
  (`safeKey`).
- **Manual smoke (browser):** paste rich text + image from Docs/WhatsApp, save, verify render,
  copy-out into an email, run `export_ideas.py` and confirm dated Markdown + local images.

---

## 13. Open items for the implementation plan

- Exact `idea_reads` shape (seen-set vs `lastSeenAt`) and the badge query.
- The precise Firestore composite indexes for the inbox filters.
- Tiptap toolbar scope (how much manual formatting beyond paste).
- Whether `recipients[]` picker reads the `allowlist` collection for the email list (it should;
  confirm read access for sub-admins to the allowlist for the picker, or provide a minimal
  members list).

## 13.1 Guardrails from spec review (resolve in the plan)

- **Firestore `list`-query safety.** Firestore rejects a `list` rule that reads a field the
  query does not constrain (see the documented lesson in `firestore.rules` around the feedback
  rules). The `ideas` read rule reads `visibility`, `author`, and `recipients`, so the inbox
  queries (§7) must filter on exactly those fields — design the inbox queries and composite
  indexes around this from the start, do not rediscover it at runtime.
- **Field-level update guard.** §8's `update` rule lets the author rewrite any field, but
  `status`/`tags` are meant to be Adnan-set. If that split must be enforced, add field-level
  guards to the update rule (mirroring the feedback update rule), so an author cannot change
  `status`/`tags`/`visibility` after the fact.
- **`ideaId` minted before upload.** Image upload happens during compose, before the idea is
  saved, and the R2 key is `ideas/<ideaId>/<file>`. The client must mint the Firestore doc id
  up front (`doc(collection(db,'ideas'))` to get a ref/id) so the key is stable across
  upload-then-save.
- **Copy-out size at scale.** Base64-inlining every R2 image into one `ClipboardItem` can be
  heavy for image-dense ideas. Set a total-size budget and degrade gracefully (e.g. fall back
  to a presigned-URL `<img src>` in the HTML flavour beyond the budget).

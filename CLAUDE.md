# CLAUDE.md — Studio Whence × Diamond Pocket Books editorial dashboard

This is the **public** Next.js app for the DPB editorial dashboard
(`dpb.studiowhence.com` / `studio-whence-dpb.web.app`). It is a static app shell
gated by Firebase Auth; an allow-listed Diamond editorial team signs in to see
the live state of Studio Whence's comic production.

---

## 🔒 HARD RULE — this repo is PUBLIC; commit CODE ONLY

**Never commit any data-bearing asset to this repo.** That means **no**:

- real `content.json` with actual comic titles / loglines / statuses (only a
  data-less line *skeleton* may live in `public/data/content.json`),
- images, character art, sample renders, or any production art,
- draft scripts (`script.md`), research markdown, transcripts, or exports,
- secrets — Firebase **web** config (the `NEXT_PUBLIC_*` values) goes in
  `.env.local` (gitignored); admin/service-account keys never come near this repo.

All of that is unpublished IP and third-party copyrighted source. **All data is
served gated at runtime** through a Firebase Cloud Function (auth + presign) in
front of Cloudflare R2 (storage), after a Firebase-auth check. The Function
validates the Firebase token + allowlist and returns short-lived presigned R2
URLs; bytes flow R2 → client directly. When a feature needs real data, fetch it through that gated
channel — do **not** bundle it into the static build. (A real `content.json` and
character art were once committed here by mistake; this rule exists so it never
recurs.)

---

## Stack
- Next.js 16 (App Router) with `output: 'export'` → static export served by Firebase Hosting.
- React 19, TypeScript, Tailwind v4 (brand tokens in `@theme` + `:root` in `globals.css`).
- Firebase Auth (Google + email-link) + Firestore (allowlist / access_requests / access_log).
- `@next/mdx` for hand-authored line intros. vitest + React Testing Library for tests.
- Dev server runs on **port 5509** (`npm run dev`).

## Auth model
- `adnan@thothica.com` = admin (`NEXT_PUBLIC_ADMIN_EMAIL` + `firestore.rules` `isAdmin()`).
- `@thothica.com` + `@dpb.in` domains default-allow; others → `/pending`.
- Allowlist + redirects are enforced client-side AND in `firestore.rules` (fail-closed).

## Conventions
- Stage commits by explicit filename — never `git add -A`.
- Tests must pass (`npm test`), `npx tsc --noEmit` clean, and `npm run build` succeed before committing.
- Studio Whence voice on all visible copy: short sentences; no "journey / elevate /
  curated / experience" (noun); positioning line **"Stories in becoming."**
- Brand: Cormorant Garamond (serif) + Instrument Sans (sans), indigo / gold / pale-dusk
  palette, gold used sparingly as a seasoning. Deep-indigo (`.surface-deep`) for heroes/footer.

## Search Worker (`workers/search/`) — the first step off Firebase

`sw-dpb-search` (https://sw-dpb-search.appsadoistic.workers.dev) answers
`GET /search?q=&limit=&offset=` from an index at `search/comics/index.json` in
R2, built by the content repo's `tools/build_search_index.py` and published by
`tools/publish_search_index.py`.

- **`search/` is NOT in `RESOLVE_PREFIXES` or `READ_PREFIXES`, and must never be.**
  The index holds the text of every comic in every language; the Worker's
  allocation filter is the only thing in front of it.
- **The Worker holds no privileged credential.** It verifies the caller's
  Firebase ID token against Google's JWKS, then forwards that same token to the
  Firestore REST API to read only `allowlist/{email}`, `suspended/{email}` and
  `allocations/{email}` — the three docs the rules already let a user read about
  themselves. A compromise leaks nothing a signed-in user could not already
  fetch. **Every later migration stage should follow this pattern.**
- Results are filtered by allocation BEFORE the response is written.
- The allocation gate now exists in three places — `firestore.rules`,
  `functions/src/allocation.ts`, `workers/search/src/allocation.ts`. Collapsing
  them is the point of migration stage 3; until then, a change to one is a
  change to all three.
- Deploy: `cd workers/search && npx wrangler deploy`. Tests: `npx vitest run`.
- `NEXT_PUBLIC_SEARCH_API_URL` is inlined at BUILD time — a build without it
  ships a search box that silently fails.

## Characters tab + downloads (2026-10-19)

Every work (comic, subject, programme, `/characters`) has a Characters tab built
by ONE component, `WorkCharacters`, over per-comic cast docs:

- **`casts/{line}__{slug}`** — one doc per published comic (plus `{line}__library`
  for sheets staged on no page yet), written by the content repo's
  `tools/publish_work_casts.py`. Read rule = the comics rule, so every view is a
  union (`castModel.mergeCasts`) of casts the viewer may already read. Identity
  is `(line, id)`; shared IP has line `shared`.
- **`castIndex/{line}`** — function-only (rules deny clients). `dataApi` reads it
  to decide whether a MEMBER may presign `artifacts/characters/{line}/{id}/…`.
- **Downloads** — `lib/downloads.ts`: one file = `/resolve` with a `download`
  name (R2 `Content-Disposition: attachment`) + a link click; many files = a
  client-zip stream (File System Access API where present, else a Blob).
  Character sheets are zipped in the browser — as PNGs, as one PDF contact book
  (`lib/characterPdf.ts`, built from the 1600 px `print` JPEGs, which pdf-lib embeds
  without decoding), or both with the PDF inside the zip; research uses pre-built
  `bundles/research/{line}/{figure}/…` (content repo
  `tools/publish_research_bundles.py`, pointers `figures/*.researchZip` and
  `sources/*.bundle`) and assembles in the browser when a bundle is stale.
- `bundles/` is presign-only (RESOLVE_PREFIXES), parsed by `scopeOfKey` as the
  figure's research scope. Zip entry names are capped (folder 60, file 80) so
  Windows' built-in unzip never meets a path over 260 characters.

## Download all (2026-10-21)

Every comic page has a **Download all** button in its masthead: every file the portal
holds for the book, as ONE zip in numbered folders (`01 Comic` … `09 History and
comments`) with a `README.txt` at the top that explains each folder and file, says what
the book has none of, and lists anything that did not arrive.

- `lib/downloadAll.ts` is PURE: `buildBundlePlan(comic, ctx)` lists every file by group
  (an R2 key to stream, text to write, or a file the browser makes); `bundleReadme`
  writes the README last, from what actually landed. `lib/downloadAllRun.ts` binds each
  made file to the builder its own button uses (`lib/comicPdf`, `ComicDocxButton`, the
  Export… model, `lib/characterPdf`, `lib/researchDownloads`), so a file in the zip is the
  file its button gives.
- **A new download on the comic page must be added to `buildBundlePlan` too**, or
  Download all silently leaves it out. Folder numbers are fixed (07 is always the
  characters): a new kind joins a folder or takes the next number, never renumbers.
- Built in the browser and streamed (to disk where the File System Access API exists);
  no server copy, nothing new in the gate. Keys are signed as the zip goes
  (`createPresigner` in `lib/downloads.ts`): a presigned URL lives 10 minutes and a 1 GB
  zip takes longer.
- `downloadZip` takes each response's READER the moment it arrives. An unlocked body
  whose Response is collected can be cancelled by the runtime, and the file then lands
  in the zip as 0 bytes, unreported: 31 of 158 files did in the first real build. A body
  that ends short of its Content-Length is reported as failed. Only SHORT counts: R2
  gzips text for browsers, so a decoded `.md` is longer than its Content-Length.
- Visual QA without a session: `/dev-download-all-preview` (renders nothing in a
  production build).

## Deploy
`npm run build && firebase deploy --only hosting` (also `firestore:rules` when rules change).
Firebase **Storage is intentionally not used** — gated assets go through the
Firebase Cloud Function + R2 (presigned URLs).

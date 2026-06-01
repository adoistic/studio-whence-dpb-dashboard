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

## Deploy
`npm run build && firebase deploy --only hosting` (also `firestore:rules` when rules change).
Firebase **Storage is intentionally not used** — gated assets go through the
Firebase Cloud Function + R2 (presigned URLs).

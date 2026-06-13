/**
 * medikidzSite.ts — pure HTML rewrite for the gated Medikidz "Comic Analysis"
 * embed.
 *
 * The Medikidz analysis is a single self-contained page stored in R2 at
 * `sites/medikidz/index.html`, alongside `sites/medikidz/assets/covers/*.jpg`
 * (48) and `sites/medikidz/assets/pages/*.jpg` (147). The page references those
 * images by BARE RELATIVE PATH (`assets/covers/X.jpg`, `assets/pages/Y.jpg`) in
 * two places:
 *   - a handful of static `<img src="assets/...">` attributes, and
 *   - an inline `<script>` with `const BOOKS=[…]` whose objects carry
 *     `cover:"assets/covers/X.jpg"` and `pages:[{src:"assets/pages/Y.jpg"}]`,
 *     rendered into the DOM via `innerHTML` (≈192 of 195 images).
 *
 * Since the images live in a gated R2 bucket, the browser cannot fetch them by
 * relative path. This function replaces every bare `assets/(covers|pages)/<rel>.jpg`
 * token — in BOTH attribute strings and JS string literals — with a presigned
 * R2 URL for `sites/medikidz/<rel-path>`. A single regex over the whole HTML
 * covers both shapes because it matches the path token itself, not its context.
 *
 * There is NO password gate to strip (it was already removed); this is an
 * image-rewrite ONLY. Untrusted-content handling (sandboxing) is the iframe's
 * job in the UI layer, not this function's.
 */

/**
 * The path-token matcher. Matches `assets/covers/...jpg` and `assets/pages/...jpg`
 * wherever they appear (an `<img src>` attribute value or a JS string literal).
 *
 * `[^"'\s)]+` consumes the relative path (which may contain `/` subfolders) up
 * to — but not including — the closing quote, whitespace, or `)` that always
 * terminates the token in HTML/JS/CSS contexts, so it never swallows trailing
 * markup. `\.jpg` is case-insensitive. `g` so every occurrence is rewritten.
 */
const ASSET_PATH_RE = /assets\/(?:covers|pages)\/[^"'\s)]+?\.jpg/gi

/**
 * Rewrite every bare Medikidz asset path in `html` to a presigned R2 URL.
 *
 * @param html    The raw `sites/medikidz/index.html` text.
 * @param presign Maps an R2 key (e.g. `sites/medikidz/assets/covers/a.jpg`) to a
 *                presigned GET URL. Called per occurrence.
 * @returns       The HTML with every `assets/(covers|pages)/<rel>.jpg` replaced.
 */
export function rewriteMedikidzHtml(
  html: string,
  presign: (key: string) => string
): string {
  return html.replace(ASSET_PATH_RE, (relPath) =>
    presign(`sites/medikidz/${relPath}`)
  )
}

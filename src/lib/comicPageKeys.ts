import type { Comic } from '@/types/content'

/** Ordered R2 keys for a comic's images: cover (if any) then page-01…page-NN.
 * Page keys are synthesized from `pages.count`. [] when no rendered art.
 * These are the 2000px print masters — the reader displays the web variants
 * (`webVariantKey`); the PDF/print paths keep using these. */
export function comicPageKeys(comic: Comic): string[] {
  const pages = comic.pages
  if (!pages?.hasPages) return []
  const keys: string[] = []
  if (pages.coverKey) keys.push(pages.coverKey)
  for (let n = 1; n <= pages.count; n++) {
    const nn = String(n).padStart(2, '0')
    keys.push(`images/comics/${comic.line}/${comic.slug}/pages/page-${nn}.jpg`)
  }
  return keys
}

/** The web-size (1200px) variant of a master key: `web/` before the basename —
 * `…/pages/page-01.jpg` → `…/pages/web/page-01.jpg`, `…/cover.jpg` →
 * `…/web/cover.jpg`. Published by the content repo's web-derivatives tooling. */
export function webVariantKey(masterKey: string): string {
  const cut = masterKey.lastIndexOf('/')
  return cut === -1 ? `web/${masterKey}` : `${masterKey.slice(0, cut)}/web/${masterKey.slice(cut + 1)}`
}

/** `comicPageKeys`, as the web-size variants the reader actually fetches. */
export function comicWebPageKeys(comic: Comic): string[] {
  return comicPageKeys(comic).map(webVariantKey)
}

/**
 * Ordered page URLs, preferring the 1200px web variant and falling back to the
 * 2000px master PER PAGE.
 *
 * The web variants are an OPTIMISATION, not a guarantee: 29 comics were
 * published before the derivatives existed and have none. The reader already
 * falls back to masters; the downloads did not, so every low-resolution
 * download on those comics resolved zero URLs and died with "Could not build
 * the PDF" (Adnan, 2026-08-21). Falling back costs a larger fetch and nothing
 * else — a low-res download downscales the bytes anyway.
 *
 * `masterKeys` drives the ORDER; a page that resolved neither way is dropped
 * rather than left as a hole in the document.
 */
export function pickPageUrls(
  masterKeys: string[], urls: Record<string, string>, preferWeb: boolean,
): string[] {
  return masterKeys
    .map((masterKey) =>
      (preferWeb ? urls[webVariantKey(masterKey)] : undefined) ?? urls[masterKey])
    .filter((u): u is string => !!u)
}

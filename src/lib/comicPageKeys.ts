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

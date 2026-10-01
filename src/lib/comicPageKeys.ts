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

/** The keys the downloadable PDF is built from, in BOOK order: front cover,
 * inside front cover, page-01…page-NN, inside back cover.
 *
 * The reader pages through `comicPageKeys` only, but the PDF is the file a
 * client reviews as "the artwork", and the inside covers are printed pages of
 * the book. Diamond, 30 Sep 2026, on Larry Page & Sergey Brin: the 49-page PDF
 * they downloaded carried no inside front or inside back cover, although both
 * were rendered and published to `insideCovers`. A cover is told apart by its
 * label or key ("front" / "back"); anything else in the block stays out. */
export function comicPdfKeys(comic: Comic): string[] {
  const keys = comicPageKeys(comic)
  if (keys.length === 0) return keys
  const imgs = comic.insideCovers?.images ?? []
  const isFront = (i: { key: string; label: string }) => /front/i.test(i.label) || /inside-front/i.test(i.key)
  const isBack = (i: { key: string; label: string }) => /back/i.test(i.label) || /inside-back/i.test(i.key)
  const front = imgs.filter(isFront).map((i) => i.key)
  const back = imgs.filter((i) => !isFront(i) && isBack(i)).map((i) => i.key)
  const at = comic.pages?.coverKey ? 1 : 0
  return [...keys.slice(0, at), ...front, ...keys.slice(at), ...back]
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

import type { Comic } from '@/types/content'

/** Ordered R2 keys for a comic's images: cover (if any) then page-01…page-NN.
 * Page keys are synthesized from `pages.count`. [] when no rendered art. */
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

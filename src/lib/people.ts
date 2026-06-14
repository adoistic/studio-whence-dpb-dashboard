import type { Figure, Comic, Status, Content } from '@/types/content'
import type { PersonDoc } from '@/lib/catalog'
import { normalizeSubjectSlug } from '@/lib/slugs'

export type Stage = 'researched' | Status

// researched (pre-comic) sorts below every comic status; placeholder is the
// lowest comic status. Sourced from the data Status union + the synthetic
// 'researched' (NOT the script validator's enum, which omits placeholder).
export const STAGE_RANK: Record<Stage, number> = {
  researched: 0,
  placeholder: 1,
  draft: 2,
  'in-review': 3,
  approved: 4,
  published: 5,
}

export interface PersonRow {
  slug: string                  // figure slug, or the comic subject_slug for an orphan
  name: string                  // title-cased display
  series: string
  stage: Stage
  stageRank: number
  comicCount: number
  sourcesCount: number | null
  words: number | null
  href: string                  // /figures/<slug> for a figure; /<line>/<comic> for an orphan
}

function titleCaseSlug(slug: string): string {
  return slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

export type PersonComic = {
  slug: string
  line: string
  title: string
  status: Comic['status']
  comic_number?: number
  target_length_pages?: number
}

/** The comics about a figure (matched case-insensitively on subject_slug). */
export function personComics(content: Content | null, figureSlug: string): PersonComic[] {
  return (content?.lines.flatMap((l) => l.comics) ?? [])
    .filter((c) => normalizeSubjectSlug(c.subject_slug) === figureSlug)
    .map((c) => ({
      slug: c.slug,
      line: c.line,
      title: c.title,
      status: c.status,
      comic_number: c.comic_number,
      target_length_pages: c.target_length_pages,
    }))
}

// ─── Edition / variant labels ────────────────────────────────────────────────
//
// A subject can carry several comics (the medicomics diseases ship a Standard
// 24-page and a Premium 48-page edition). Their raw titles are near-identical and
// very long, so a switcher shows a SHORT, DISTINGUISHING label per variant
// instead. Two derivation paths:
//   • medicomics-style editions → "Standard · 24 pages" / "Premium · 48 pages",
//     edition read from the slug suffix (-standard / -premium) or comic_number
//     (1 = Standard, 2 = Premium), the page count from target_length_pages.
//   • anything else (e.g. a biography figure's "early years" / "peak career") →
//     the comic's own short title, with a shared common prefix stripped when both
//     siblings share one.

/**
 * The edition kind a comic's slug suffix implies, or null. The slug suffix
 * (-standard / -premium) is the load-bearing signal — only the medicomics
 * editions carry it. comic_number (1/2) is a fallback used ONLY to order an
 * already-suffix-detected edition set, never to classify on its own: every
 * biography subject numbers its comics 1, 2, … so comic_number alone would
 * wrongly read "early years" / "peak career" as Standard / Premium.
 */
function editionKind(c: PersonComic): 'Standard' | 'Premium' | null {
  if (/-standard$/.test(c.slug)) return 'Standard'
  if (/-premium$/.test(c.slug)) return 'Premium'
  return null
}

/** Strip a prefix the two titles share, on a word boundary, so labels read clean. */
function stripSharedPrefix(title: string, common: string): string {
  if (!common) return title
  const rest = title.slice(common.length)
  // Trim leading separators/space left over once the shared run is removed.
  const cleaned = rest.replace(/^[\s:—–\-·(]+/, '').trim()
  return cleaned || title
}

/** The longest leading run (trimmed to a word boundary) shared by every title. */
function commonTitlePrefix(titles: string[]): string {
  if (titles.length < 2) return ''
  let prefix = titles[0]
  for (const t of titles.slice(1)) {
    let i = 0
    while (i < prefix.length && i < t.length && prefix[i] === t[i]) i++
    prefix = prefix.slice(0, i)
  }
  // Back off to the last space so we never cut a word in half.
  const lastSpace = prefix.lastIndexOf(' ')
  return lastSpace > 0 ? prefix.slice(0, lastSpace) : ''
}

export type VariantLabel = { primary: string; detail?: string }

/**
 * A short, distinguishing label for each comic in a multi-comic subject, in the
 * SAME order as the input. Editions (Standard/Premium) render the edition word as
 * `primary` and the page count as `detail`; otherwise the comic's own title
 * (shared prefix stripped) is the `primary`.
 */
export function variantLabels(comics: PersonComic[]): VariantLabel[] {
  const allEditions =
    comics.length > 1 && comics.every((c) => editionKind(c) !== null)
  if (allEditions) {
    return comics.map((c) => {
      const pages = c.target_length_pages
      return {
        primary: editionKind(c)!,
        detail: pages != null ? `${pages} pages` : undefined,
      }
    })
  }
  const common = commonTitlePrefix(comics.map((c) => c.title))
  return comics.map((c) => ({ primary: stripSharedPrefix(c.title, common) }))
}

// The "furthest" comic = highest status rank; ties broken by lowest comic_number, then slug.
export function furthestComic<T extends { status: Status; comic_number?: number; slug: string }>(comics: T[]): T | null {
  if (!comics.length) return null
  return [...comics].sort((a, b) => {
    const r = STAGE_RANK[b.status] - STAGE_RANK[a.status]
    if (r !== 0) return r
    // NaN-safe: if both comic_number are undefined the subtraction is NaN (falsy) → falls through to slug.
    return ((a.comic_number ?? Infinity) - (b.comic_number ?? Infinity)) || a.slug.localeCompare(b.slug)
  })[0]
}

export function derivePeople(figures: Figure[], comics: Comic[]): PersonRow[] {
  const rows: PersonRow[] = []
  const claimed = new Set<Comic>()

  // One row per figure, with its matched comics.
  for (const f of figures) {
    const mine = comics.filter((c) => normalizeSubjectSlug(c.subject_slug) === f.slug)
    mine.forEach((c) => claimed.add(c))
    const top = mine.length ? furthestComic(mine) : null
    const stage: Stage = top ? top.status : 'researched'
    rows.push({
      slug: f.slug,
      name: titleCaseSlug(f.slug),
      series: f.series,
      stage,
      stageRank: STAGE_RANK[stage],
      comicCount: mine.length,
      sourcesCount: f.sources_count,
      words: f.words,
      href: `/figures/${f.slug}`,
    })
  }

  // Orphan comics (no matching figure): group by subject_slug (or stand alone), each its own row.
  const orphans = comics.filter((c) => !claimed.has(c))
  const byKey = new Map<string, Comic[]>()
  for (const c of orphans) {
    const key = normalizeSubjectSlug(c.subject_slug) || c.slug
    byKey.set(key, [...(byKey.get(key) ?? []), c])
  }
  for (const [key, group] of byKey) {
    const top = furthestComic(group)!
    rows.push({
      slug: key,
      name: top.subject ?? titleCaseSlug(key),
      series: top.series ?? '',
      stage: top.status,
      stageRank: STAGE_RANK[top.status],
      comicCount: group.length,
      sourcesCount: null,
      words: null,
      href: `/${top.line}/${top.slug}`,
    })
  }

  return rows
}

/** Map a publisher-computed people-projection doc to the PersonRow PeopleTable consumes. */
export function personDocToRow(p: PersonDoc): PersonRow {
  return {
    slug: p.slug,
    name: p.name,
    series: p.series,
    stage: p.stage as Stage,
    stageRank: p.stage_rank,
    comicCount: p.comic_count,
    sourcesCount: p.sources_count,
    words: p.words,
    href: p.is_orphan && p.furthest_comic_slug
      ? `/${p.line}/${p.furthest_comic_slug}`
      : `/figures/${p.slug}`,
  }
}

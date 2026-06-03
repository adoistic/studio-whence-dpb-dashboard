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
}

/** The comics about a figure (matched case-insensitively on subject_slug). */
export function personComics(content: Content | null, figureSlug: string): PersonComic[] {
  return (content?.lines.flatMap((l) => l.comics) ?? [])
    .filter((c) => normalizeSubjectSlug(c.subject_slug) === figureSlug)
    .map((c) => ({ slug: c.slug, line: c.line, title: c.title, status: c.status, comic_number: c.comic_number }))
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

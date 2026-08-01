import { normalizeSubjectSlug } from '@/lib/slugs'
import { programComics, programFigures } from '@/lib/programMembership'
import type { Comic, Figure, Line, Program } from '@/types/content'

// ─── Master production status: the row model ────────────────────────────────────
//
// The flat rows behind the in-app "Download Excel" button. Deliberately pure —
// no exceljs, no DOM — so every count is unit-testable and the workbook module
// only has to lay these out.
//
// The same sheet/column contract is produced offline by the content repo's
// tools/build_status_workbook.py. Keep the two in step: they are two renderers
// of one report, and a column that exists in only one of them is a bug.
//
// Layout is FLAT on purpose. Every headline number is derivable by pivot rather
// than hardcoded, so a reader can chart any cut without trusting a total
// somebody typed.

export const SITE_ROUTES = {
  comic: (line: string, slug: string) => `/${line}/${slug}`,
  figure: (slug: string) => `/figures/${slug}`,
  program: (line: string, slug: string) => `/programs/${line}/${slug}`,
  line: (slug: string) => `/${slug}`,
}

/** The parts a finished book needs beyond its interior (CLAUDE.md §4f-bis). */
export const COMPONENTS: { label: string; count: (c: Comic) => number }[] = [
  { label: 'Interior pages', count: (c) => c.pages?.count ?? 0 },
  { label: 'Cover', count: (c) => (c.pages?.coverKey ? 1 : 0) },
  { label: 'Cover options', count: (c) => c.coverOptions?.options?.length ?? 0 },
  { label: 'Inside covers', count: (c) => c.insideCovers?.images?.length ?? 0 },
  { label: 'Back cover', count: (c) => (c.backCover?.image ? 1 : 0) },
  { label: 'Activity pages', count: (c) => c.activities?.pages?.length ?? 0 },
  { label: 'About the book', count: (c) => c.aboutTheBook?.segments?.length ?? (c.aboutTheBook ? 1 : 0) },
  { label: 'CMYK print PDF', count: (c) => (c.cmykPdf?.key ? 1 : 0) },
  { label: 'Editable deck', count: (c) => (c.editablePpt?.key ? 1 : 0) },
  { label: 'Translations', count: (c) => c.translations?.length ?? 0 },
  {
    label: 'Amazon A+ modules',
    count: (c) =>
      (c.amazonModules?.groups ?? []).reduce((n, g) => n + (g.images?.length ?? 0), 0) +
      (c.amazonModules?.images?.length ?? 0),
  },
  { label: 'Published docs', count: (c) => c.docs?.items?.length ?? 0 },
]

// Research bands set from the real distribution: the median subject holds about
// 31k words while the top tenth clear half a million, so equal-width bands would
// drop nearly everything into one bucket.
const RESEARCH_BANDS: [number, string][] = [
  [1_000_000, '5 · Exhaustive (1M+ words)'],
  [250_000, '4 · Deep (250k–1M)'],
  [50_000, '3 · Substantial (50k–250k)'],
  [10_000, '2 · Working (10k–50k)'],
  [1, '1 · Seed (under 10k)'],
]

export function researchBand(words: number): string {
  for (const [floor, label] of RESEARCH_BANDS) if (words >= floor) return label
  return '0 · None'
}

export const STATUS_ORDER = ['draft', 'in-review', 'approved', 'published']

/** `in_review` and `in-review` are one stage written two ways in source. */
export function normStatus(s: string | undefined | null): string {
  return (s ?? 'unknown').trim().toLowerCase().replace(/_/g, '-')
}

export function titleCaseSlug(slug: string): string {
  return (slug ?? '')
    .replace(/_/g, '-')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** `_`-prefixed keys are metadata (the row's link) and are never written as columns. */
export type Row = { [column: string]: string | number | null | undefined; _href?: string }

export function comicRows(comics: Comic[]): Row[] {
  return comics
    .slice()
    .sort((a, b) => `${a.line}__${a.slug}`.localeCompare(`${b.line}__${b.slug}`))
    .map((c) => {
      const target = c.target_length_pages ?? 0
      const made = c.pages?.count ?? 0
      const pageState =
        made === 0
          ? '0 · No pages'
          : target && made >= target
            ? '3 · All pages (potentially complete)'
            : '2 · Some pages'

      const row: Row = {
        Line: c.line,
        Program: c.program_slug ?? '(none)',
        Series: c.series ?? '',
        Subject: normalizeSubjectSlug(c.subject_slug) || '(standalone title)',
        Comic: c.title ?? c.slug,
        Slug: c.slug,
        Status: normStatus(c.status),
        'Comic #': c.comic_number ?? null,
        // A comic exists in the catalog only because a validated script does.
        Script: 'Yes',
        'Target pages': target || null,
        'Pages made': made,
        'Pages %': target ? Math.round((made / target) * 10000) / 10000 : null,
        'Page state': pageState,
        'Cited sources': c.sources_count ?? null,
        Narrator: c.narrator ?? '',
        'Target age': c.target_age ?? '',
        Format: c.format ?? 'comic',
        Language: c.language ?? 'English',
        Version: c.version ?? null,
        Created: c.created ?? '',
        Updated: c.updated ?? '',
        Logline: c.logline ?? '',
        _href: SITE_ROUTES.comic(c.line, c.slug),
      }

      let present = 0
      for (const { label, count } of COMPONENTS) {
        const n = count(c)
        row[label] = n
        row[`${label} ✓`] = n ? 'Yes' : 'No'
        if (n) present += 1
      }
      row['Components present'] = present
      row['Components possible'] = COMPONENTS.length
      row['Component %'] = Math.round((present / COMPONENTS.length) * 10000) / 10000
      row['Translation languages'] = Array.from(
        new Set((c.translations ?? []).map((t) => t.language || '?')),
      )
        .sort()
        .join(', ')
      return row
    })
}

export function subjectRows(figures: Figure[], comics: Comic[]): Row[] {
  const bySubject = new Map<string, Comic[]>()
  for (const c of comics) {
    const k = normalizeSubjectSlug(c.subject_slug)
    if (k) bySubject.set(k, [...(bySubject.get(k) ?? []), c])
  }

  return figures
    .slice()
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((f) => {
      const mine = bySubject.get(normalizeSubjectSlug(f.slug)) ?? []
      const words = f.words ?? 0
      const ranked = mine
        .map((c) => normStatus(c.status))
        .filter((s) => STATUS_ORDER.includes(s))
        .sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))
      const furthest = ranked.at(-1) ?? (mine.length ? normStatus(mine[0].status) : 'researched')

      const pagesMade = mine.reduce((n, c) => n + (c.pages?.count ?? 0), 0)
      const complete = mine.filter(
        (c) => (c.pages?.count ?? 0) > 0 && (c.target_length_pages ?? 0) > 0
          && (c.pages?.count ?? 0) >= (c.target_length_pages ?? 0),
      ).length
      const some = mine.filter((c) => (c.pages?.count ?? 0) > 0).length

      const stage = !mine.length
        ? '1 · Researched only'
        : pagesMade === 0
          ? '2 · Script written'
          : complete
            ? '4 · All pages made'
            : '3 · Some pages made'

      return {
        Line: f.line ?? '',
        Program: f.program_slug ?? '(none)',
        'Also in programs': (f.also_programs ?? []).join(', '),
        Series: f.series ?? '',
        Subject: titleCaseSlug(f.slug),
        Slug: f.slug,
        Sources: f.sources_count ?? 0,
        Words: words,
        'Research band': researchBand(words),
        'Has research': words ? 'Yes' : 'No',
        Dossier: f.dossierKey ? 'Yes' : 'No',
        'Design bible': f.designKey ? 'Yes' : 'No',
        Characterization: f.characterizationKey ? 'Yes' : 'No',
        Variations: f.variations?.length ?? 0,
        Comics: mine.length,
        'Has script': mine.length ? 'Yes' : 'No',
        'Comics with some pages': some,
        'Comics with all pages': complete,
        'Total pages made': pagesMade,
        'Production stage': stage,
        'Furthest comic status': furthest,
        'Open research': f.openResearch ? 'Yes' : 'No',
        _href: SITE_ROUTES.figure(f.slug),
      } as Row
    })
}

export function programRows(programs: Program[], comics: Comic[], figures: Figure[]): Row[] {
  return programs
    .slice()
    .sort((a, b) => `${a.line}__${a.slug}`.localeCompare(`${b.line}__${b.slug}`))
    .map((p) => {
      // Membership matches the program page exactly, cross-listing included.
      const subs = programFigures(figures, p.line, p.slug)
      const cs = programComics(comics, figures, p.line, p.slug)
      const withPages = cs.filter((c) => (c.pages?.count ?? 0) > 0)
      const allPages = cs.filter(
        (c) => (c.target_length_pages ?? 0) > 0 && (c.pages?.count ?? 0) >= (c.target_length_pages ?? 0),
      )
      const byStatus = Object.fromEntries(
        STATUS_ORDER.map((s) => [`Comics ${s}`, cs.filter((c) => normStatus(c.status) === s).length]),
      )
      return {
        Line: p.line,
        Program: p.title || titleCaseSlug(p.slug),
        Slug: p.slug,
        'Program status': p.status ?? '',
        Subjects: subs.length,
        'Cross-listed in': subs.filter((f) => f.program_slug !== p.slug).length,
        Comics: cs.length,
        'Comics with all pages': allPages.length,
        'Comics with some pages': withPages.length - allPages.length,
        'Total pages made': cs.reduce((n, c) => n + (c.pages?.count ?? 0), 0),
        Sources: subs.reduce((n, f) => n + (f.sources_count ?? 0), 0),
        Words: subs.reduce((n, f) => n + (f.words ?? 0), 0),
        ...byStatus,
        _href: SITE_ROUTES.program(p.line, p.slug),
      } as Row
    })
}

export function lineRows(lines: Line[], comics: Comic[], figures: Figure[], programs: Program[]): Row[] {
  return lines
    .slice()
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((l) => {
      const cs = comics.filter((c) => c.line === l.slug)
      const subs = figures.filter((f) => f.line === l.slug)
      const allPages = cs.filter(
        (c) => (c.target_length_pages ?? 0) > 0 && (c.pages?.count ?? 0) >= (c.target_length_pages ?? 0),
      )
      const some = cs.filter((c) => (c.pages?.count ?? 0) > 0)
      const byStatus = Object.fromEntries(
        STATUS_ORDER.map((s) => [`Comics ${s}`, cs.filter((c) => normStatus(c.status) === s).length]),
      )
      return {
        Line: l.title || titleCaseSlug(l.slug),
        Slug: l.slug,
        Programs: programs.filter((p) => p.line === l.slug).length,
        Subjects: subs.length,
        'Subjects with research': subs.filter((f) => (f.words ?? 0) > 0).length,
        Comics: cs.length,
        'Comics with all pages': allPages.length,
        'Comics with some pages': some.length - allPages.length,
        'Comics with no pages': cs.length - some.length,
        'Total pages made': cs.reduce((n, c) => n + (c.pages?.count ?? 0), 0),
        Sources: subs.reduce((n, f) => n + (f.sources_count ?? 0), 0),
        Words: subs.reduce((n, f) => n + (f.words ?? 0), 0),
        ...byStatus,
        _href: SITE_ROUTES.line(l.slug),
      } as Row
    })
}

/** Long format: one row per comic × component. Pivots straight into a chart. */
export function componentRows(rows: Row[]): Row[] {
  const out: Row[] = []
  for (const c of rows) {
    for (const { label } of COMPONENTS) {
      out.push({
        Line: c.Line,
        Program: c.Program,
        Subject: c.Subject,
        Comic: c.Comic,
        Status: c.Status,
        Component: label,
        Present: c[label] ? 1 : 0,
        Count: c[label] as number,
        _href: c._href,
      })
    }
  }
  return out
}

export function tally<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>()
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1)
  return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
}

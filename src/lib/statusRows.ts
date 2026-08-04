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
export const NOT_STARTED = '0 · Not started (index entry only)'

// A scaffolded-but-unstarted subject still carries its index stub — the eleven
// Bollywood Legends figures each hold about 104 words and no sources. Counting
// those as "has research" overstates the library by eleven subjects, so a
// subject counts as researched once it holds a source OR more than a stub of
// text. Both conditions are needed: some real dossiers are built from reference
// collections that register no `sources` entry (J.C. Bose, 244k words, zero
// sources), and the stubs sit three orders of magnitude below them, so the split
// is unambiguous rather than a tuned threshold.
export const STUB_WORDS = 1_000

export function hasResearch(sources: number, words: number): boolean {
  return sources > 0 || words >= STUB_WORDS
}

export function researchBand(words: number, sources = 0): string {
  if (!hasResearch(sources, words)) return NOT_STARTED
  for (const [floor, label] of RESEARCH_BANDS) if (words >= floor) return label
  return NOT_STARTED
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

// ── Billable pages ────────────────────────────────────────────────────────────
//
// What a finished comic actually bills for is more than its interior: the cover,
// the inside front cover (IFC), the inside back cover (IBC), the back cover and
// the activity pages are all drawn pages. The counting rule is Adnan's
// (2026-08-04), with his worked example: cover 1 + back cover 1 + IFC 1 + IBC 1
// + four activity pages = 8.
//   · cover — the three cover OPTIONS collapse to ONE page (they are drafts of
//     the same cover, not three covers); a shipped coverKey is that same page
//   · IFC and IBC — SEPARATE pages, one each, counted independently. They are
//     produced independently too: plenty of books have the IFC ("Meet the
//     Characters") and no IBC yet, and merging them into one number hid exactly
//     that. Which one exists is read from the artifact key/label.
//   · activity pages — on actuals (four activity pages bill as four)
//   · back cover — one page when present
// This is the single place the rule lives; the dashboard and any export import
// it rather than restating it.

export interface PageBreakdown {
  interior: number
  cover: 0 | 1
  /** Inside FRONT cover — its own page. */
  insideFront: 0 | 1
  /** Inside BACK cover — its own page, produced independently of the IFC. */
  insideBack: 0 | 1
  backCover: 0 | 1
  activities: number
  /** cover + insideFront + insideBack + backCover + activities */
  extras: number
  /** interior + extras — the billable page count */
  billable: number
}

/**
 * Which inside covers exist, read from each artifact's key and label
 * (`inside-front-cover.png`, "Inside back cover — …").
 *
 * An image matching neither pattern fills the front slot first, then the back,
 * so an oddly-named artifact still counts as a real page instead of vanishing —
 * but it can never inflate the count past one IFC and one IBC.
 */
export function insideCoverPages(c: Comic): { insideFront: 0 | 1; insideBack: 0 | 1 } {
  let front = false
  let back = false
  let unlabelled = 0
  for (const img of c.insideCovers?.images ?? []) {
    const hay = `${img?.key ?? ''} ${img?.label ?? ''}`.toLowerCase()
    if (/inside[-_\s]?front|\bifc\b/.test(hay)) front = true
    else if (/inside[-_\s]?back|\bibc\b/.test(hay)) back = true
    else unlabelled += 1
  }
  if (unlabelled > 0 && !front) { front = true; unlabelled -= 1 }
  if (unlabelled > 0 && !back) back = true
  return { insideFront: front ? 1 : 0, insideBack: back ? 1 : 0 }
}

export function pageBreakdown(c: Comic): PageBreakdown {
  const interior = c.pages?.count ?? 0
  const cover: 0 | 1 =
    c.pages?.coverKey || (c.coverOptions?.options?.length ?? 0) > 0 ? 1 : 0
  const { insideFront, insideBack } = insideCoverPages(c)
  const backCover: 0 | 1 = c.backCover?.image ? 1 : 0
  const activities = c.activities?.pages?.length ?? 0
  const extras = cover + insideFront + insideBack + backCover + activities
  return {
    interior, cover, insideFront, insideBack, backCover, activities,
    extras, billable: interior + extras,
  }
}

// ── Billed pages: the ACCOUNTING basis ────────────────────────────────────────
//
// The rule is the accounting team's (2026-08-04, amended 2026-08-04 pm):
//
//   · Interior — bill the SCRIPT's page count from the moment the script
//     exists: a book reading "0 / 48" bills 48, not 0. But the script target is
//     a plan, and plans go stale — one book was planned at 48 and later grew by
//     four pages, and the table kept billing the old number. So the actuals
//     OVERWRITE the plan the moment they pass it: billed interior is
//     max(script target, interior pages actually produced). A stale target can
//     under-bill exactly once — never again.
//   · Cover and activities — every book always carries a standard EIGHT pages:
//     front cover, back cover, the inside covers and four activity pages. They
//     bill from day one even when none exist yet ("nothing converts into
//     eight"); what is not yet produced simply shows as not generated. The same
//     overwrite applies: a book that produces MORE than the standard bills the
//     actuals, and an explicit per-comic figure replaces the standard 8 as the
//     floor ("unless it is said otherwise").
//
// So 0/48 with nothing else recorded bills 48 + 8 = 56 — and when those four
// extra interior pages land, the same book bills 52 + 8 = 60 with no one
// touching a config.
//
// This is the single place the billing rule lives. pageBreakdown stays the
// truth about what exists; the two must not be conflated.

/** Cover + back cover + IFC + IBC + four activity pages. */
export const STANDARD_EXTRA_PAGES = 8

export interface BilledPages {
  /** Interior pages billed — max(script target, interior actually produced). */
  interior: number
  /** Where that came from: the script's plan, or actuals that overtook it. */
  interiorSource: 'script' | 'produced'
  /** Cover + inside covers + back cover + activity pages, as billed. */
  extras: number
  /** How many of those actually exist today. */
  actualExtras: number
  /** Why the billed extras are what they are. */
  extrasSource: 'standard' | 'produced' | 'override'
  /** interior + extras — the page count the invoice multiplies by the rate. */
  total: number
  /** Interior + extras actually produced so far — the generated-work basis. */
  generated: number
}

export interface ExtraPagesRule {
  /** The standard allotment when fewer extras exist. Defaults to 8. */
  standard?: number
  /** An explicit floor for this comic — "unless it is said otherwise". */
  override?: number
}

export function billedPages(c: Comic, rule: ExtraPagesRule = {}): BilledPages {
  const b = pageBreakdown(c)
  const target = c.target_length_pages ?? 0

  // Actuals overwrite the plan. The script target bills from day one, but the
  // moment production passes it the produced count wins — this is what stops a
  // stale "planned 48" from under-billing a book that grew to 52.
  const interior = Math.max(target, b.interior)
  const interiorSource: BilledPages['interiorSource'] =
    b.interior >= interior && b.interior > 0 ? 'produced' : 'script'

  const floor = Number.isFinite(rule.override)
    ? Math.max(0, rule.override as number)
    : Number.isFinite(rule.standard)
      ? Math.max(0, rule.standard as number)
      : STANDARD_EXTRA_PAGES

  // Same overwrite for the extras: the standard 8 (or the explicit figure) is a
  // floor, and producing more than it bills the actuals.
  const extras = Math.max(floor, b.extras)
  const extrasSource: BilledPages['extrasSource'] =
    b.extras > floor ? 'produced' : Number.isFinite(rule.override) ? 'override' : 'standard'

  return {
    interior,
    interiorSource,
    extras,
    actualExtras: b.extras,
    extrasSource,
    total: interior + extras,
    generated: b.billable,
  }
}

/**
 * Whether a comic's interior is fully drawn — the ONE rule, used by the Comics,
 * Subjects, Programs and Lines sheets so no two of them can disagree.
 *
 * A published book has shipped, so its interior is complete by definition. That
 * clause is what keeps the published Diamond Activity Books from reading as
 * half-made: their script target counts covers (50) while the published page set
 * is interior-only (48–49).
 */
export function isComplete(c: Comic): boolean {
  const made = c.pages?.count ?? 0
  const target = c.target_length_pages ?? 0
  if (made === 0) return false
  return (target > 0 && made >= target) || normStatus(c.status) === 'published'
}

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
          : isComplete(c)
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
      const complete = mine.filter(isComplete).length
      const some = mine.filter((c) => (c.pages?.count ?? 0) > 0).length

      const stage = !mine.length && !hasResearch(f.sources_count ?? 0, words)
        ? '0 · Scaffolded, not started'
        : !mine.length
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
        'Research band': researchBand(words, f.sources_count ?? 0),
        'Has research': hasResearch(f.sources_count ?? 0, words) ? 'Yes' : 'No',
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
      const allPages = cs.filter(isComplete)
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
      const allPages = cs.filter(isComplete)
      const some = cs.filter((c) => (c.pages?.count ?? 0) > 0)
      const byStatus = Object.fromEntries(
        STATUS_ORDER.map((s) => [`Comics ${s}`, cs.filter((c) => normStatus(c.status) === s).length]),
      )
      return {
        Line: l.title || titleCaseSlug(l.slug),
        Slug: l.slug,
        Programs: programs.filter((p) => p.line === l.slug).length,
        Subjects: subs.length,
        'Subjects with research': subs.filter((f) => hasResearch(f.sources_count ?? 0, f.words ?? 0)).length,
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

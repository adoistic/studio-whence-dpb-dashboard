/**
 * Production model — one roll-up, four altitudes.
 *
 * Studio → Line → Program → Comic. Every tier is the SAME shape (`Tally`), so a
 * table that renders one tier renders all of them and the headline can never
 * drift from the rows beneath it: the studio total is literally the sum of the
 * line totals, computed here rather than typed anywhere.
 *
 * Deliberately pure — no React, no Firestore, no formatting. Every number on the
 * status page is derivable from `comics` + a `PricingConfig`, which is what makes
 * the whole thing unit-testable and what lets the same functions back an export.
 *
 * The completeness rule is imported from statusRows rather than restated, because
 * this page and the Excel workbook disagreeing about whether a book is finished
 * would be worse than either being wrong on its own.
 */

import { isComplete, normStatus, titleCaseSlug, STATUS_ORDER } from '@/lib/statusRows'
import { rateFor, type PricingConfig } from '@/lib/pricing'
import type { Comic, Line, Program } from '@/types/content'

export interface Tally {
  /** Slug for the tier (line slug, program slug, or `${line}__${slug}`). */
  key: string
  label: string
  comics: number
  /** Comics whose interior is fully drawn (statusRows.isComplete). */
  complete: number
  pagesMade: number
  pagesTarget: number
  /** pagesMade / pagesTarget, 0–1. Null when nothing is targeted. */
  progress: number | null
  byStatus: Record<string, number>
  contracted: number
  delivered: number
  /** Distinct per-page rates inside this tier — >1 means "mixed". */
  rates: number[]
}

function emptyStatuses(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of STATUS_ORDER) out[s] = 0
  return out
}

export function tallyOf(key: string, label: string, comics: Comic[], pricing: PricingConfig | null): Tally {
  const byStatus = emptyStatuses()
  const rates = new Set<number>()
  let pagesMade = 0
  let pagesTarget = 0
  let contracted = 0
  let delivered = 0
  let complete = 0

  for (const c of comics) {
    const status = normStatus(c.status)
    byStatus[status] = (byStatus[status] ?? 0) + 1
    const made = c.pages?.count ?? 0
    const target = c.target_length_pages ?? 0
    pagesMade += made
    pagesTarget += target
    const { rate } = rateFor(c, pricing)
    rates.add(rate)
    contracted += rate * target
    delivered += rate * made
    if (isComplete(c)) complete += 1
  }

  return {
    key,
    label,
    comics: comics.length,
    complete,
    pagesMade,
    pagesTarget,
    progress: pagesTarget > 0 ? pagesMade / pagesTarget : null,
    byStatus,
    contracted,
    delivered,
    rates: Array.from(rates).sort((a, b) => a - b),
  }
}

export interface ComicRowModel {
  comic: Comic
  key: string
  title: string
  line: string
  program: string
  subject: string
  status: string
  pagesMade: number
  pagesTarget: number
  progress: number | null
  complete: boolean
  rate: number
  rateSource: 'comic' | 'line' | 'default'
  overridden: boolean
  contracted: number
  delivered: number
  updated: string
  href: string
}

export function comicModel(c: Comic, pricing: PricingConfig | null): ComicRowModel {
  const { rate, source, overridden } = rateFor(c, pricing)
  const made = c.pages?.count ?? 0
  const target = c.target_length_pages ?? 0
  return {
    comic: c,
    key: `${c.line}__${c.slug}`,
    title: c.title || titleCaseSlug(c.slug),
    line: c.line,
    program: c.program_slug ?? '',
    subject: c.subject_slug ?? '',
    status: normStatus(c.status),
    pagesMade: made,
    pagesTarget: target,
    progress: target > 0 ? made / target : null,
    complete: isComplete(c),
    rate,
    rateSource: source,
    overridden,
    contracted: rate * target,
    delivered: rate * made,
    updated: c.updated ?? c.created ?? '',
    href: `/${c.line}/${c.slug}`,
  }
}

export interface ProgramNode {
  tally: Tally
  comics: ComicRowModel[]
}

export interface LineNode {
  tally: Tally
  programs: ProgramNode[]
  comics: ComicRowModel[]
}

export interface ProductionModel {
  studio: Tally
  lines: LineNode[]
  comics: ComicRowModel[]
}

/**
 * Build the whole tree.
 *
 * `lines` and `programs` supply titles only; membership always comes from the
 * comics themselves (`c.line`, `c.program_slug`). A comic belonging to a line
 * with no catalog doc still has to appear somewhere, so an unknown line is
 * synthesised from its slug rather than dropped — a book vanishing from the
 * status page because its metadata is late is the failure mode worth avoiding.
 */
export function buildModel(
  comics: Comic[],
  lines: Line[] | null,
  programs: Program[] | null,
  pricing: PricingConfig | null,
): ProductionModel {
  const lineTitle = new Map((lines ?? []).map((l) => [l.slug, l.title]))
  const programTitle = new Map((programs ?? []).map((p) => [`${p.line}__${p.slug}`, p.title]))

  const byLine = new Map<string, Comic[]>()
  for (const c of comics) {
    const arr = byLine.get(c.line)
    if (arr) arr.push(c)
    else byLine.set(c.line, [c])
  }

  const lineNodes: LineNode[] = []
  for (const [slug, lineComics] of byLine) {
    const byProgram = new Map<string, Comic[]>()
    for (const c of lineComics) {
      const key = c.program_slug || ''
      const arr = byProgram.get(key)
      if (arr) arr.push(c)
      else byProgram.set(key, [c])
    }

    const programNodes: ProgramNode[] = Array.from(byProgram, ([pslug, pComics]) => ({
      tally: tallyOf(
        pslug || `${slug}__none`,
        pslug ? (programTitle.get(`${slug}__${pslug}`) ?? titleCaseSlug(pslug)) : 'Unassigned',
        pComics,
        pricing,
      ),
      comics: pComics.map((c) => comicModel(c, pricing)).sort(byTitle),
    })).sort((a, b) => b.tally.comics - a.tally.comics || a.tally.label.localeCompare(b.tally.label))

    lineNodes.push({
      tally: tallyOf(slug, lineTitle.get(slug) ?? titleCaseSlug(slug), lineComics, pricing),
      programs: programNodes,
      comics: lineComics.map((c) => comicModel(c, pricing)).sort(byTitle),
    })
  }

  lineNodes.sort((a, b) => b.tally.comics - a.tally.comics || a.tally.label.localeCompare(b.tally.label))

  return {
    studio: tallyOf('studio', 'All lines', comics, pricing),
    lines: lineNodes,
    comics: comics.map((c) => comicModel(c, pricing)).sort(byTitle),
  }
}

function byTitle(a: ComicRowModel, b: ComicRowModel): number {
  return a.title.localeCompare(b.title)
}

// ── Trend ─────────────────────────────────────────────────────────────────────

export interface TrendPoint {
  /** `YYYY-MM` */
  month: string
  /** Comics whose script was first created this month. */
  started: number
  /** Comics edited this month, per their changelog. */
  touched: number
  /** Running total of comics started, through this month. */
  cumulative: number
}

function monthOf(date: string | undefined): string | null {
  if (!date) return null
  const m = /^(\d{4})-(\d{2})/.exec(date.trim())
  return m ? `${m[1]}-${m[2]}` : null
}

/**
 * A monthly trend, built only from dates the content actually carries.
 *
 * `started` comes from each comic's `created`; `touched` counts dated changelog
 * entries. What this CANNOT show is pages-drawn-over-time: art has no per-page
 * date anywhere in the catalog, only a current count. Charting delivered value
 * against these months would imply a history that was never recorded, so the
 * series stay honest about being script-authoring activity, and the UI says so.
 */
export function buildTrend(comics: Comic[]): TrendPoint[] {
  const started = new Map<string, number>()
  const touched = new Map<string, number>()

  for (const c of comics) {
    const created = monthOf(c.created)
    if (created) started.set(created, (started.get(created) ?? 0) + 1)

    const months = new Set<string>()
    for (const entry of c.changelog ?? []) {
      const raw = typeof entry === 'string' ? entry : entry?.date
      const m = monthOf(typeof raw === 'string' ? raw : undefined)
      if (m) months.add(m)
    }
    // Fall back to `updated` when a comic keeps no dated changelog, so a book
    // that has plainly been worked on is not invisible in the activity series.
    if (months.size === 0) {
      const u = monthOf(c.updated)
      if (u) months.add(u)
    }
    for (const m of months) touched.set(m, (touched.get(m) ?? 0) + 1)
  }

  const all = Array.from(new Set([...started.keys(), ...touched.keys()])).sort()
  let running = 0
  return all.map((month) => {
    running += started.get(month) ?? 0
    return {
      month,
      started: started.get(month) ?? 0,
      touched: touched.get(month) ?? 0,
      cumulative: running,
    }
  })
}

/** Flat rows for CSV export — the same numbers the page shows. */
export function exportRows(model: ProductionModel, currency = 'INR'): Record<string, string | number>[] {
  return model.comics.map((c) => ({
    Line: c.line,
    Program: c.program || '(unassigned)',
    Subject: c.subject || '(standalone)',
    Comic: c.title,
    Slug: c.comic.slug,
    Status: c.status,
    'Pages made': c.pagesMade,
    'Target pages': c.pagesTarget,
    'Pages %': c.progress === null ? '' : Math.round(c.progress * 100),
    Complete: c.complete ? 'Yes' : 'No',
    [`Rate per page (${currency})`]: c.rate,
    'Rate source': c.rateSource,
    [`Delivered (${currency})`]: c.delivered,
    [`Contracted (${currency})`]: c.contracted,
    Updated: c.updated,
  }))
}

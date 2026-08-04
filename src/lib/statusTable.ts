/**
 * The status table — one row per comic, every column Adnan asked for
 * (2026-08-04), in spreadsheet order:
 *
 *   Classification · Sub-classification · Comic · Interior · Covers · IFC/IBC
 *   · Activities · Total pages · Rate · Total value · Script · Dossier
 *   · Illustration · Marketing
 *
 * Each deliverable is its OWN column carrying its OWN approval, because a book
 * is signed off stage by stage rather than all at once. IFC/IBC and activity
 * pages are separate columns for the same reason: they are produced
 * independently, and merging them hid which of the two was actually missing.
 *
 * Pure — no React, no Firestore — so every cell is unit-testable and the CSV
 * export is the same rows the screen shows.
 *
 * Dates: the script date is the script's front-matter `created`. The dossier
 * column reports the research state (word count banded by statusRows) — the
 * catalog records no dossier delivery date, and this table does not invent one.
 */

import { STAGES, stageReady, type ComicApprovals, type Stage, type StageApproval } from '@/lib/approvals'
import { rateFor, type PricingConfig } from '@/lib/pricing'
import { hasResearch, pageBreakdown, titleCaseSlug, type PageBreakdown } from '@/lib/statusRows'
import type { Comic, Figure, Line, Program } from '@/types/content'

/** What one stage cell needs to render itself. */
export interface StageCell {
  stage: Stage
  /** Something has been delivered, so this stage can be approved. */
  ready: boolean
  /** Short text for the cell — "24 / 48", "IFC only", "Amazon ×4", … */
  detail: string
  approval: StageApproval | null
}

export interface StatusTableRow {
  key: string
  classification: string
  subClassification: string
  title: string
  href: string
  interior: number
  target: number
  breakdown: PageBreakdown
  /** Interior + cover + back cover + IFC + IBC + activity pages. */
  totalPages: number
  rate: number
  rateSource: 'comic' | 'line' | 'default'
  totalValue: number
  scriptDate: string
  /** Every stage, keyed — the table renders one column per stage. */
  stages: Record<Stage, StageCell>
  /** How many stages are both delivered and signed off. */
  approvedCount: number
  readyCount: number
}

function dossierDetail(figure: Figure | undefined, subjectSlug: string | null): string {
  if (!subjectSlug) return 'Not subject-based'
  if (!figure) return 'Not started'
  const words = figure.words ?? 0
  if (!hasResearch(figure.sources_count ?? 0, words)) return 'Not started'
  return `${Math.round(words / 1000)}k words`
}

function marketingDetail(c: Comic): string {
  const amazon =
    (c.amazonModules?.groups ?? []).reduce((n, g) => n + (g.images?.length ?? 0), 0) +
    (c.amazonModules?.images?.length ?? 0)
  const bits = [amazon > 0 ? `Amazon ×${amazon}` : null, c.aboutTheBook ? 'About the book' : null].filter(Boolean)
  return bits.length ? bits.join(' · ') : 'None yet'
}

function coversDetail(b: PageBreakdown): string {
  const bits = [b.cover ? 'Front' : null, b.backCover ? 'Back' : null].filter(Boolean)
  return bits.length === 2 ? 'Front + back' : bits.length === 1 ? `${bits[0]} only` : 'None yet'
}

/** Says WHICH inside cover exists — the whole point of splitting them out. */
function insideDetail(b: PageBreakdown): string {
  if (b.insideFront && b.insideBack) return 'IFC + IBC'
  if (b.insideFront) return 'IFC only'
  if (b.insideBack) return 'IBC only'
  return 'None yet'
}

function stageDetail(stage: Stage, c: Comic, b: PageBreakdown, figure: Figure | undefined): string {
  switch (stage) {
    case 'script':
      return (c.created ?? '').slice(0, 10) || 'Received'
    case 'dossier':
      return dossierDetail(figure, c.subject_slug ?? null)
    case 'illustration':
      return `${b.interior} / ${c.target_length_pages ?? 0}`
    case 'covers':
      return coversDetail(b)
    case 'insideCovers':
      return insideDetail(b)
    case 'activities':
      return b.activities > 0 ? `${b.activities} pages` : 'None yet'
    case 'marketing':
      return marketingDetail(c)
  }
}

export function buildStatusTable(
  comics: Comic[],
  figures: Figure[] | null,
  lines: Line[] | null,
  programs: Program[] | null,
  pricing: PricingConfig | null,
  approvals: Record<string, ComicApprovals> | null,
): StatusTableRow[] {
  const lineTitle = new Map((lines ?? []).map((l) => [l.slug, l.title]))
  const programTitle = new Map((programs ?? []).map((p) => [`${p.line}__${p.slug}`, p.title]))
  const figureBySlug = new Map((figures ?? []).map((f) => [f.slug, f]))

  const rows = comics.map((c): StatusTableRow => {
    const b = pageBreakdown(c)
    const { rate, source } = rateFor(c, pricing)
    const key = `${c.line}__${c.slug}`
    const figure = figureBySlug.get(c.subject_slug ?? '')
    const approved = approvals?.[key] ?? {}
    const sub = c.program_slug
      ? (programTitle.get(`${c.line}__${c.program_slug}`) ?? c.series ?? titleCaseSlug(c.program_slug))
      : (c.series ?? '—')

    const stages = {} as Record<Stage, StageCell>
    let approvedCount = 0
    let readyCount = 0
    for (const stage of STAGES) {
      const ready = stageReady(stage, c, figure)
      const approval = approved[stage] ?? null
      if (ready) readyCount += 1
      if (approval) approvedCount += 1
      stages[stage] = { stage, ready, detail: stageDetail(stage, c, b, figure), approval }
    }

    return {
      key,
      classification: lineTitle.get(c.line) ?? titleCaseSlug(c.line),
      subClassification: sub || '—',
      title: c.title || titleCaseSlug(c.slug),
      href: `/${c.line}/${c.slug}`,
      interior: b.interior,
      target: c.target_length_pages ?? 0,
      breakdown: b,
      totalPages: b.billable,
      rate,
      rateSource: source,
      totalValue: rate * b.billable,
      scriptDate: (c.created ?? '').slice(0, 10),
      stages,
      approvedCount,
      readyCount,
    }
  })

  // Spreadsheet order: classification, then sub-classification, then title —
  // so all Business Legends sit together under Biographies.
  return rows.sort(
    (a, b) =>
      a.classification.localeCompare(b.classification) ||
      a.subClassification.localeCompare(b.subClassification) ||
      a.title.localeCompare(b.title),
  )
}

export interface StatusTableTotals {
  comics: number
  interior: number
  target: number
  covers: number
  insideCovers: number
  activities: number
  totalPages: number
  totalValue: number
  approvedStages: number
  readyStages: number
}

export function statusTableTotals(rows: StatusTableRow[]): StatusTableTotals {
  const t: StatusTableTotals = {
    comics: rows.length, interior: 0, target: 0, covers: 0, insideCovers: 0,
    activities: 0, totalPages: 0, totalValue: 0, approvedStages: 0, readyStages: 0,
  }
  for (const r of rows) {
    t.interior += r.interior
    t.target += r.target
    t.covers += r.breakdown.cover + r.breakdown.backCover
    t.insideCovers += r.breakdown.insideFront + r.breakdown.insideBack
    t.activities += r.breakdown.activities
    t.totalPages += r.totalPages
    t.totalValue += r.totalValue
    t.approvedStages += r.approvedCount
    t.readyStages += r.readyCount
  }
  return t
}

/** The same rows, flattened for CSV — the export IS the screen. */
export function statusTableCsvRows(rows: StatusTableRow[], currency = 'INR'): Record<string, string | number>[] {
  const cell = (r: StatusTableRow, s: Stage) => {
    const c = r.stages[s]
    return c.approval ? `Approved ${c.approval.at.slice(0, 10)}` : c.ready ? 'Awaiting approval' : 'Not delivered'
  }
  return rows.map((r) => ({
    Classification: r.classification,
    'Sub-classification': r.subClassification,
    Comic: r.title,
    'Interior pages': r.interior,
    'Target pages': r.target,
    Cover: r.breakdown.cover,
    'Back cover': r.breakdown.backCover,
    IFC: r.breakdown.insideFront,
    IBC: r.breakdown.insideBack,
    'Activity pages': r.breakdown.activities,
    'Total pages': r.totalPages,
    [`Rate per page (${currency})`]: r.rate,
    [`Total value (${currency})`]: r.totalValue,
    'Script date': r.scriptDate,
    'Script approval': cell(r, 'script'),
    Dossier: r.stages.dossier.detail,
    'Dossier approval': cell(r, 'dossier'),
    Illustration: r.stages.illustration.detail,
    'Illustration approval': cell(r, 'illustration'),
    Covers: r.stages.covers.detail,
    'Covers approval': cell(r, 'covers'),
    'IFC / IBC': r.stages.insideCovers.detail,
    'IFC / IBC approval': cell(r, 'insideCovers'),
    Activities: r.stages.activities.detail,
    'Activities approval': cell(r, 'activities'),
    Marketing: r.stages.marketing.detail,
    'Marketing approval': cell(r, 'marketing'),
    'Stages approved': `${r.approvedCount} of ${r.readyCount} delivered`,
  }))
}

/**
 * The status table — one row per comic, in spreadsheet order (Adnan,
 * 2026-08-04, simplified the same day):
 *
 *   Classification · Sub-classification · Comic
 *   · Pages · Extras · Total · Generated          (the page story)
 *   · Rate · Invoice value · With GST · Net after TDS   (the money story)
 *   · Script … Marketing                          (the sign-off story)
 *   · Invoice                                     (approved-for-invoice trail)
 *
 * Pages bill on the SCRIPT basis with actuals overwriting the plan
 * (statusRows.billedPages); the per-component IFC/IBC/activity split is
 * deliberately NOT shown as value columns any more — only pages, extras,
 * total. Money: invoice value → GST 18% → net after 2% TDS (TDS on the base,
 * never on the GST-inclusive figure). The generated value tracks work actually
 * produced. Arithmetic lives in pricing.billingFor; nothing here computes.
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

import {
  PRODUCTION_STAGES,
  STAGES,
  stageReady,
  type ComicApprovals,
  type InvoiceState,
  type Stage,
  type StageApproval,
} from '@/lib/approvals'
import { billingFor, sumTaxes, type PricingConfig, type TaxBreakdown } from '@/lib/pricing'
import { hasResearch, pageBreakdown, titleCaseSlug, type BilledPages, type PageBreakdown } from '@/lib/statusRows'
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

export interface StatusTableRow extends TaxBreakdown {
  key: string
  classification: string
  subClassification: string
  title: string
  href: string
  /** Interior pages actually drawn — production progress, not the billing basis. */
  interior: number
  target: number
  /** What exists today, per component. */
  breakdown: PageBreakdown
  /** What bills: script interior (actuals overwrite) + the extras allotment. */
  billed: BilledPages
  /** billed.total — the page count the invoice multiplies by the rate. */
  totalPages: number
  /** Pages actually produced so far — interior drawn + extras made. */
  generatedPages: number
  /** generatedPages × rate — the value of the work completed to date. */
  generatedValue: number
  rate: number
  rateSource: 'comic' | 'line' | 'default'
  scriptDate: string
  /** Every stage, keyed — the table renders one column per stage. */
  stages: Record<Stage, StageCell>
  /** How many stages are both delivered and signed off. */
  approvedCount: number
  readyCount: number
  /** Same pair over the PRODUCTION stages only — marketing never gates an invoice. */
  prodApproved: number
  prodReady: number
  /** The invoice trail: approved-for-invoice and invoice-generated marks. */
  invoice: InvoiceState
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
  invoices: Record<string, InvoiceState> | null = null,
): StatusTableRow[] {
  const lineTitle = new Map((lines ?? []).map((l) => [l.slug, l.title]))
  const programTitle = new Map((programs ?? []).map((p) => [`${p.line}__${p.slug}`, p.title]))
  const figureBySlug = new Map((figures ?? []).map((f) => [f.slug, f]))

  const rows = comics.map((c): StatusTableRow => {
    const b = pageBreakdown(c)
    const billing = billingFor(c, pricing)
    const key = `${c.line}__${c.slug}`
    const figure = figureBySlug.get(c.subject_slug ?? '')
    const approved = approvals?.[key] ?? {}
    const sub = c.program_slug
      ? (programTitle.get(`${c.line}__${c.program_slug}`) ?? c.series ?? titleCaseSlug(c.program_slug))
      : (c.series ?? '—')

    const stages = {} as Record<Stage, StageCell>
    let approvedCount = 0
    let readyCount = 0
    let prodApproved = 0
    let prodReady = 0
    for (const stage of STAGES) {
      const ready = stageReady(stage, c, figure)
      const approval = approved[stage] ?? null
      const production = PRODUCTION_STAGES.includes(stage)
      if (ready) {
        readyCount += 1
        if (production) prodReady += 1
      }
      if (approval) {
        approvedCount += 1
        if (production) prodApproved += 1
      }
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
      billed: billing.pages,
      totalPages: billing.pages.total,
      generatedPages: billing.generatedPages,
      generatedValue: billing.generatedValue,
      rate: billing.rate,
      rateSource: billing.rateSource,
      totalValue: billing.totalValue,
      gst: billing.gst,
      totalWithGst: billing.totalWithGst,
      tds: billing.tds,
      netOfTds: billing.netOfTds,
      scriptDate: (c.created ?? '').slice(0, 10),
      stages,
      approvedCount,
      readyCount,
      prodApproved,
      prodReady,
      invoice: invoices?.[key] ?? {},
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

export interface StatusTableTotals extends TaxBreakdown {
  comics: number
  /** Delivered actuals — what exists today. */
  interior: number
  target: number
  covers: number
  insideCovers: number
  activities: number
  /** Billed basis — script interior pages (actuals overwrite the plan). */
  scriptPages: number
  /** Billed basis — the extras allotment. */
  billedExtras: number
  totalPages: number
  /** Pages actually produced so far, and their value. */
  generatedPages: number
  generatedValue: number
  approvedStages: number
  readyStages: number
  /** How many books sit in each invoice state. */
  approvedForInvoice: number
  invoicesGenerated: number
}

export function statusTableTotals(rows: StatusTableRow[]): StatusTableTotals {
  // Money totals are summed per line, each line already rounded — the way an
  // invoice adds up, so the footer matches the rows a reader can see.
  const money = sumTaxes(rows)
  const t: StatusTableTotals = {
    comics: rows.length, interior: 0, target: 0, covers: 0, insideCovers: 0,
    activities: 0, scriptPages: 0, billedExtras: 0, totalPages: 0,
    generatedPages: 0, generatedValue: 0, approvedStages: 0, readyStages: 0,
    approvedForInvoice: 0, invoicesGenerated: 0, ...money,
  }
  for (const r of rows) {
    t.interior += r.interior
    t.target += r.target
    t.covers += r.breakdown.cover + r.breakdown.backCover
    t.insideCovers += r.breakdown.insideFront + r.breakdown.insideBack
    t.activities += r.breakdown.activities
    t.scriptPages += r.billed.interior
    t.billedExtras += r.billed.extras
    t.totalPages += r.totalPages
    t.generatedPages += r.generatedPages
    t.generatedValue += r.generatedValue
    t.approvedStages += r.approvedCount
    t.readyStages += r.readyCount
    if (r.invoice.approved) t.approvedForInvoice += 1
    if (r.invoice.generated) t.invoicesGenerated += 1
  }
  return t
}

/** The same rows, flattened for CSV — the export IS the screen. */
export function statusTableCsvRows(rows: StatusTableRow[], currency = 'INR'): Record<string, string | number>[] {
  const cell = (r: StatusTableRow, s: Stage) => {
    const c = r.stages[s]
    return c.approval ? `Approved ${c.approval.at.slice(0, 10)}` : c.ready ? 'Awaiting approval' : 'Not delivered'
  }
  const invoiceCell = (r: StatusTableRow) =>
    r.invoice.generated
      ? `Invoice generated ${r.invoice.generated.at.slice(0, 10)}`
      : r.invoice.approved
        ? `Approved for invoice ${r.invoice.approved.at.slice(0, 10)}`
        : 'Not approved'
  return rows.map((r) => ({
    Classification: r.classification,
    'Sub-classification': r.subClassification,
    Comic: r.title,
    // The billed basis — the numbers the invoice is checked against.
    'Script pages': r.billed.interior,
    Extras: r.billed.extras,
    'Total pages': r.totalPages,
    'Generated pages': r.generatedPages,
    [`Rate per page (${currency})`]: r.rate,
    [`Invoice value (${currency})`]: r.totalValue,
    [`GST 18% (${currency})`]: r.gst,
    [`Invoice value with GST (${currency})`]: r.totalWithGst,
    [`TDS 2% (${currency})`]: r.tds,
    [`Net receivable after TDS (${currency})`]: r.netOfTds,
    [`Generated value (${currency})`]: r.generatedValue,
    Invoice: invoiceCell(r),
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

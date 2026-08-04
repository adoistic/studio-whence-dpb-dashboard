/**
 * The status table — one row per comic, every column Adnan asked for
 * (2026-08-04), in spreadsheet order:
 *
 *   Classification · Sub-classification · Comic · Pages · +Covers & activities
 *   · Total · Rate · Total value · Script (+date) · Dossier · Illustration
 *   · Complete set · Marketing · Diamond
 *
 * Pure — no React, no Firestore, no formatting beyond labels — so every cell is
 * unit-testable and the CSV export is the same rows the screen shows.
 *
 * Dates: the script date is the script's front-matter `created`. The dossier
 * column reports the research state (word count banded by statusRows) — the
 * catalog records no dossier delivery date, and this table does not invent one.
 */

import { deliveryOf, type ApprovalDoc, type Delivery } from '@/lib/approvals'
import { rateFor, type PricingConfig } from '@/lib/pricing'
import { hasResearch, pageBreakdown, titleCaseSlug, type PageBreakdown } from '@/lib/statusRows'
import type { Comic, Figure, Line, Program } from '@/types/content'

export interface DossierCell {
  /** 'ready' | 'seed' | 'none' | 'n/a' (no subject figure, e.g. an activity book) */
  state: 'ready' | 'seed' | 'none' | 'n/a'
  label: string
  words: number | null
}

export interface SetCell {
  cover: boolean
  backCover: boolean
  insideCovers: boolean
  activities: number
  /** All four component groups present. */
  complete: boolean
}

export interface MarketingCell {
  amazon: number
  about: boolean
  label: string
}

export interface StatusTableRow {
  key: string
  classification: string
  subClassification: string
  title: string
  href: string
  /** Interior pages drawn / script target. */
  interior: number
  target: number
  breakdown: PageBreakdown
  /** Interior + cover + IFC/IBC + back cover + activity pages. */
  totalPages: number
  rate: number
  rateSource: 'comic' | 'line' | 'default'
  totalValue: number
  scriptDate: string
  dossier: DossierCell
  illustration: { label: 'Not started' | 'In progress' | 'Done'; pct: number | null }
  set: SetCell
  marketing: MarketingCell
  delivery: Delivery
  approval: ApprovalDoc | null
}

function dossierOf(c: Comic, figure: Figure | undefined): DossierCell {
  if (!c.subject_slug) return { state: 'n/a', label: 'Not subject-based', words: null }
  if (!figure) return { state: 'none', label: 'Not started', words: null }
  const words = figure.words ?? 0
  const sources = figure.sources_count ?? 0
  if (!hasResearch(sources, words)) return { state: 'none', label: 'Not started', words }
  if (words >= 10_000) return { state: 'ready', label: `Ready · ${Math.round(words / 1000)}k words`, words }
  return { state: 'seed', label: `Started · ${Math.round(words / 1000)}k words`, words }
}

function marketingOf(c: Comic): MarketingCell {
  const amazon =
    (c.amazonModules?.groups ?? []).reduce((n, g) => n + (g.images?.length ?? 0), 0) +
    (c.amazonModules?.images?.length ?? 0)
  const about = !!c.aboutTheBook
  const bits = [amazon > 0 ? `Amazon ×${amazon}` : null, about ? 'About the book' : null].filter(Boolean)
  return { amazon, about, label: bits.length ? bits.join(' · ') : '—' }
}

export function buildStatusTable(
  comics: Comic[],
  figures: Figure[] | null,
  lines: Line[] | null,
  programs: Program[] | null,
  pricing: PricingConfig | null,
  approvals: Record<string, ApprovalDoc> | null,
): StatusTableRow[] {
  const lineTitle = new Map((lines ?? []).map((l) => [l.slug, l.title]))
  const programTitle = new Map((programs ?? []).map((p) => [`${p.line}__${p.slug}`, p.title]))
  const figureBySlug = new Map((figures ?? []).map((f) => [f.slug, f]))

  const rows = comics.map((c): StatusTableRow => {
    const b = pageBreakdown(c)
    const { rate, source } = rateFor(c, pricing)
    const target = c.target_length_pages ?? 0
    const key = `${c.line}__${c.slug}`
    const sub = c.program_slug
      ? (programTitle.get(`${c.line}__${c.program_slug}`) ?? c.series ?? titleCaseSlug(c.program_slug))
      : (c.series ?? '—')

    return {
      key,
      classification: lineTitle.get(c.line) ?? titleCaseSlug(c.line),
      subClassification: sub || '—',
      title: c.title || titleCaseSlug(c.slug),
      href: `/${c.line}/${c.slug}`,
      interior: b.interior,
      target,
      breakdown: b,
      totalPages: b.billable,
      rate,
      rateSource: source,
      totalValue: rate * b.billable,
      scriptDate: (c.created ?? '').slice(0, 10),
      dossier: dossierOf(c, figureBySlug.get(c.subject_slug ?? '')),
      illustration:
        b.interior === 0
          ? { label: 'Not started', pct: target > 0 ? 0 : null }
          : b.interior >= target && target > 0
            ? { label: 'Done', pct: 1 }
            : { label: 'In progress', pct: target > 0 ? b.interior / target : null },
      set: {
        cover: b.cover === 1,
        backCover: b.backCover === 1,
        insideCovers: b.insideCovers > 0,
        activities: b.activities,
        complete: b.cover === 1 && b.backCover === 1 && b.insideCovers > 0 && b.activities > 0,
      },
      marketing: marketingOf(c),
      delivery: deliveryOf(c),
      approval: approvals?.[key] ?? null,
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
  extras: number
  totalPages: number
  totalValue: number
  approved: number
}

export function statusTableTotals(rows: StatusTableRow[]): StatusTableTotals {
  const t: StatusTableTotals = {
    comics: rows.length, interior: 0, target: 0, extras: 0, totalPages: 0, totalValue: 0, approved: 0,
  }
  for (const r of rows) {
    t.interior += r.interior
    t.target += r.target
    t.extras += r.breakdown.extras
    t.totalPages += r.totalPages
    t.totalValue += r.totalValue
    if (r.approval) t.approved += 1
  }
  return t
}

/** The same rows, flattened for CSV — the export IS the screen. */
export function statusTableCsvRows(rows: StatusTableRow[], currency = 'INR'): Record<string, string | number>[] {
  return rows.map((r) => ({
    Classification: r.classification,
    'Sub-classification': r.subClassification,
    Comic: r.title,
    'Interior pages': r.interior,
    'Target pages': r.target,
    Cover: r.breakdown.cover,
    'IFC/IBC': r.breakdown.insideCovers,
    'Back cover': r.breakdown.backCover,
    'Activity pages': r.breakdown.activities,
    'Total pages': r.totalPages,
    [`Rate per page (${currency})`]: r.rate,
    [`Total value (${currency})`]: r.totalValue,
    'Script delivered': 'Yes',
    'Script date': r.scriptDate,
    Dossier: r.dossier.label,
    Illustration: r.illustration.label,
    'Complete set': r.set.complete ? 'Yes' : 'No',
    Marketing: r.marketing.label,
    'Delivery state': r.delivery.label,
    'Diamond approved': r.approval ? `Yes · ${r.approval.by} · ${r.approval.at.slice(0, 10)}` : 'No',
  }))
}

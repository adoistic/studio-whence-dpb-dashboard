'use client'

/**
 * Pricing — what a page of finished comic is worth.
 *
 * One Firestore doc (`pricing/config`) holds the whole model, because it is
 * small, it is read on every status view, and a single doc means a reader can
 * never see half of a rate change.
 *
 *   { defaultRatePerPage: 250, lines: { biographies: 250, … },
 *     comics: { 'biographies__the-polyester-dream': 400 }, currency: 'INR', … }
 *
 * Resolution is three-deep, most specific first: a per-comic override beats the
 * comic's line rate, which beats the studio default. `rateFor` returns the
 * source alongside the number so the UI can say WHY a comic bills at ₹400 —
 * a rate with no visible provenance is the thing people stop trusting.
 *
 * Money is stored in whole rupees. No cents: every rate in this business is a
 * round number, and float arithmetic on money is a bug waiting for a decimal.
 */

import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { pageBreakdown } from '@/lib/statusRows'
import type { Comic } from '@/types/content'

/** Studio default until someone sets otherwise. */
export const DEFAULT_RATE_PER_PAGE = 250

export const PRICING_DOC = 'config'
export const PRICING_COLLECTION = 'pricing'

export interface PricingConfig {
  currency: string
  defaultRatePerPage: number
  /** line slug → rate per page */
  lines: Record<string, number>
  /** `${line}__${slug}` → rate per page (beats the line rate) */
  comics: Record<string, number>
  updatedAt?: string
  updatedBy?: string
}

export const EMPTY_PRICING: PricingConfig = {
  currency: 'INR',
  defaultRatePerPage: DEFAULT_RATE_PER_PAGE,
  lines: {},
  comics: {},
}

export function comicKey(line: string, slug: string): string {
  return `${line}__${slug}`
}

export type RateSource = 'comic' | 'line' | 'default'

export interface ResolvedRate {
  rate: number
  source: RateSource
  /** True when an admin has explicitly set this comic's rate. */
  overridden: boolean
}

/**
 * The rate for one comic, and where it came from.
 *
 * A stored 0 is a real answer (an unbilled title), so presence is tested with
 * `in`/Number.isFinite rather than truthiness — `rate || fallback` would
 * silently promote a deliberate zero back to ₹250.
 */
export function rateFor(comic: Pick<Comic, 'line' | 'slug'>, cfg: PricingConfig | null): ResolvedRate {
  const p = cfg ?? EMPTY_PRICING
  const override = p.comics?.[comicKey(comic.line, comic.slug)]
  if (Number.isFinite(override)) return { rate: override as number, source: 'comic', overridden: true }
  const lineRate = p.lines?.[comic.line]
  if (Number.isFinite(lineRate)) return { rate: lineRate as number, source: 'line', overridden: false }
  const dflt = p.defaultRatePerPage
  return { rate: Number.isFinite(dflt) ? dflt : DEFAULT_RATE_PER_PAGE, source: 'default', overridden: false }
}

/** The rate a line bills at, before any per-comic override. */
export function lineRate(line: string, cfg: PricingConfig | null): ResolvedRate {
  const p = cfg ?? EMPTY_PRICING
  const r = p.lines?.[line]
  if (Number.isFinite(r)) return { rate: r as number, source: 'line', overridden: true }
  const dflt = p.defaultRatePerPage
  return { rate: Number.isFinite(dflt) ? dflt : DEFAULT_RATE_PER_PAGE, source: 'default', overridden: false }
}

export interface ComicValue {
  rate: number
  source: RateSource
  /** rate × target interior pages — what the script commits to. */
  contracted: number
  /** rate × billable pages drawn (interior + cover + IFC/IBC + back + activities). */
  delivered: number
}

/**
 * Two numbers per comic, never one.
 *
 * `delivered` counts every billable page that exists — interior art plus the
 * cover (options collapse to one), inside covers, back cover and activity
 * pages, per statusRows.pageBreakdown. `contracted` counts the interior pages
 * the script commits to. Reporting a single "value" would have to pick one and
 * would read as the other to half the people looking at it.
 */
export function valueOf(comic: Comic, cfg: PricingConfig | null): ComicValue {
  const { rate, source } = rateFor(comic, cfg)
  const target = comic.target_length_pages ?? 0
  return { rate, source, contracted: rate * target, delivered: rate * pageBreakdown(comic).billable }
}

const FMT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** ₹ with Indian digit grouping (₹12,34,567) — the reader is in India. */
export function formatMoney(n: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : `${currency} `
  return `${symbol}${FMT.format(Math.round(n))}`
}

/** Compact for headline tiles: ₹1.2 Cr, ₹34.5 L, ₹12,000 — never a trailing .0. */
export function formatMoneyShort(n: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : `${currency} `
  const abs = Math.abs(n)
  // parseFloat drops a trailing .0 so a round lakh reads ₹1 L, not ₹1.0 L.
  if (abs >= 1e7) return `${symbol}${parseFloat((n / 1e7).toFixed(abs >= 1e8 ? 0 : 1))} Cr`
  if (abs >= 1e5) return `${symbol}${parseFloat((n / 1e5).toFixed(abs >= 1e6 ? 0 : 1))} L`
  return `${symbol}${FMT.format(Math.round(n))}`
}

// ── Firestore access ──────────────────────────────────────────────────────────

export interface Async<T> { data: T | null; loading: boolean; error?: Error }

/**
 * Read the pricing config.
 *
 * A missing doc is not an error — it is a studio that has never set a rate, and
 * it resolves to the ₹250 default. Returning EMPTY_PRICING rather than null
 * keeps every caller free of a "pricing not configured yet" branch.
 */
export function usePricing(refreshKey = 0): Async<PricingConfig> {
  const [state, setState] = useState<Async<PricingConfig>>({ data: null, loading: true })
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, PRICING_COLLECTION, PRICING_DOC))
        const raw = (snap.exists() ? snap.data() : {}) as Partial<PricingConfig>
        if (!alive) return
        setState({
          data: {
            currency: raw.currency ?? 'INR',
            defaultRatePerPage: Number.isFinite(raw.defaultRatePerPage)
              ? (raw.defaultRatePerPage as number)
              : DEFAULT_RATE_PER_PAGE,
            lines: raw.lines ?? {},
            comics: raw.comics ?? {},
            updatedAt: raw.updatedAt,
            updatedBy: raw.updatedBy,
          },
          loading: false,
        })
      } catch (e) {
        // A member without pricing read access still gets a working page at the
        // default rate rather than an error state.
        if (alive) setState({ data: EMPTY_PRICING, loading: false, error: e as Error })
      }
    })()
    return () => {
      alive = false
    }
  }, [refreshKey])
  return state
}

/** Merge-write, so two admins editing different lines cannot clobber each other. */
async function patch(part: Record<string, unknown>, by: string): Promise<void> {
  await setDoc(
    doc(db, PRICING_COLLECTION, PRICING_DOC),
    { ...part, updatedAt: new Date().toISOString(), updatedBy: by },
    { merge: true },
  )
}

export async function setDefaultRate(rate: number, by: string): Promise<void> {
  await patch({ defaultRatePerPage: rate }, by)
}

export async function setLineRate(line: string, rate: number, by: string): Promise<void> {
  await patch({ lines: { [line]: rate } }, by)
}

export async function setComicRate(line: string, slug: string, rate: number, by: string): Promise<void> {
  await patch({ comics: { [comicKey(line, slug)]: rate } }, by)
}

/**
 * Remove an override so the comic falls back to its line rate.
 *
 * A merge-write cannot delete a key, and `deleteField()` inside a nested map
 * needs dotted-path syntax — which breaks on slugs containing dots. So this
 * reads, deletes locally, and writes the `comics` map whole. The map is small
 * (one entry per overridden comic), and clearing an override is rare.
 */
export async function clearComicRate(line: string, slug: string, by: string): Promise<void> {
  const ref = doc(db, PRICING_COLLECTION, PRICING_DOC)
  const snap = await getDoc(ref)
  const comics = { ...(((snap.data() ?? {}) as Partial<PricingConfig>).comics ?? {}) }
  delete comics[comicKey(line, slug)]
  await setDoc(ref, { comics, updatedAt: new Date().toISOString(), updatedBy: by }, { merge: true })
}

export async function clearLineRate(line: string, by: string): Promise<void> {
  const ref = doc(db, PRICING_COLLECTION, PRICING_DOC)
  const snap = await getDoc(ref)
  const lines = { ...(((snap.data() ?? {}) as Partial<PricingConfig>).lines ?? {}) }
  delete lines[line]
  await setDoc(ref, { lines, updatedAt: new Date().toISOString(), updatedBy: by }, { merge: true })
}

/** Seed every known line at the studio default. Idempotent. */
export async function seedLineRates(lineSlugs: string[], rate: number, by: string): Promise<void> {
  const lines: Record<string, number> = {}
  for (const slug of lineSlugs) lines[slug] = rate
  await patch({ lines, defaultRatePerPage: rate }, by)
}

/** Refresh handle so a save can re-read without a full page reload. */
export function useRefreshKey(): [number, () => void] {
  const [key, setKey] = useState(0)
  return [key, useCallback(() => setKey((k) => k + 1), [])]
}

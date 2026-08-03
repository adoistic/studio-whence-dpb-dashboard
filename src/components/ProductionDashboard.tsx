'use client'

/**
 * Production dashboard — bird's eye down to a single comic.
 *
 * Four altitudes on one page, each one an expansion of the row above it:
 *   Studio headline → Line → Program → Comic.
 *
 * Every number comes from `buildModel`, so the headline is arithmetically the
 * sum of the rows underneath. Nothing here is typed in.
 *
 * Layout rules this page holds itself to:
 *   · one shared column grid for line AND program rows, with a visible header
 *     row — a bar nobody can name is a bar nobody trusts;
 *   · pages are counted honestly: interior progress is measured against the
 *     script target, while billing counts every drawn page (cover — the three
 *     options collapse to one — inside covers, back cover, activity pages);
 *   · every rate says where it came from (override / line / default).
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Comic, Line, Program } from '@/types/content'
import {
  buildModel,
  buildTrend,
  exportRows,
  type ComicRowModel,
  type LineNode,
  type ProgramNode,
  type Tally,
  type TrendPoint,
} from '@/lib/productionModel'
import { formatMoney, formatMoneyShort, type PricingConfig } from '@/lib/pricing'
import { STATUS_ORDER } from '@/lib/statusRows'

const STATUS_META: Record<string, { label: string; bar: string }> = {
  draft: { label: 'Draft', bar: 'bg-brand-slate' },
  'in-review': { label: 'In review', bar: 'bg-brand-lavender' },
  approved: { label: 'Approved', bar: 'bg-brand-gold' },
  published: { label: 'Published', bar: 'bg-brand-indigo' },
}

const n = (v: number) => Math.round(v).toLocaleString('en-IN')
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

// The one column grid shared by the header row, line rows and program rows —
// which is what keeps every bar and number under the label that names it.
const ROW_GRID =
  'md:grid md:grid-cols-[minmax(0,1fr)_150px_150px_105px_115px] md:items-center md:gap-4'

// ── Headline ──────────────────────────────────────────────────────────────────

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-3 py-5 sm:py-1 sm:px-8 first:sm:pl-0">
      <div className="font-serif font-light leading-[0.95] text-[2.4rem] md:text-[2.9rem] text-brand-indigo">
        {value}
      </div>
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="block w-7 h-px bg-brand-gold" />
        <div className="text-[0.66rem] uppercase tracking-label font-sans text-brand-slate">{label}</div>
        {sub ? <div className="font-sans text-[0.72rem] leading-snug text-brand-slate/90">{sub}</div> : null}
      </div>
    </div>
  )
}

function Headline({ t, currency }: { t: Tally; currency: string }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 sm:gap-y-6 lg:divide-x lg:divide-brand-pale-dusk">
      <Tile label="Comics in production" value={n(t.comics)} sub={`${n(t.complete)} fully drawn`} />
      <Tile
        label="Pages delivered"
        value={n(t.pagesBillable)}
        sub={`${n(t.pagesMade)} interior · ${n(t.pagesExtras)} covers, IFC/IBC & activities`}
      />
      <Tile
        label="Delivered value"
        value={formatMoneyShort(t.delivered, currency)}
        sub="every drawn page × its rate"
      />
      <Tile
        label="Contracted value"
        value={formatMoneyShort(t.contracted, currency)}
        sub={`${n(t.pagesTarget)} script pages × their rate`}
      />
    </dl>
  )
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function PipelineBar({ t }: { t: Tally }) {
  const total = t.comics
  const present = STATUS_ORDER.filter((s) => (t.byStatus[s] ?? 0) > 0)
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-brand-pale-dusk"
      title={present.map((s) => `${STATUS_META[s]?.label ?? s}: ${t.byStatus[s]}`).join(' · ')}
    >
      {total > 0 &&
        present.map((s) => (
          <span
            key={s}
            className={STATUS_META[s]?.bar ?? 'bg-brand-slate'}
            style={{ width: `${((t.byStatus[s] ?? 0) / total) * 100}%` }}
          />
        ))}
    </div>
  )
}

function ProgressBar({ value }: { value: number | null }) {
  const v = value === null ? 0 : Math.min(1, value)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full max-w-[5.5rem] overflow-hidden rounded-full bg-brand-pale-dusk">
        <span className="block h-full rounded-full bg-brand-indigo" style={{ width: `${v * 100}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right font-sans text-[0.72rem] tabular-nums text-brand-slate">
        {pct(value)}
      </span>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_META[status]?.bar ?? 'bg-brand-slate'}`}
      />
      <span className="font-sans text-[0.72rem] text-brand-slate">{STATUS_META[status]?.label ?? status}</span>
    </span>
  )
}

/** A rate that always says where it came from. */
function RateCell({ rate, source, currency }: { rate: number; source: string; currency: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="tabular-nums">{formatMoney(rate, currency)}</span>
      {source === 'comic' ? (
        <span
          className="rounded-sm bg-brand-gold/25 px-1 py-px font-sans text-[0.56rem] uppercase tracking-label text-brand-indigo"
          title="This comic has its own rate, set by an admin — it overrides the line rate."
        >
          override
        </span>
      ) : null}
    </span>
  )
}

function RatesSummary({ rates, currency }: { rates: number[]; currency: string }) {
  if (rates.length === 0) return <span className="text-brand-slate/60">—</span>
  if (rates.length === 1) return <span className="tabular-nums">{formatMoney(rates[0], currency)}</span>
  return (
    <span className="whitespace-nowrap" title={rates.map((r) => formatMoney(r, currency)).join(' · ')}>
      <span className="tabular-nums">{formatMoney(rates[0], currency)}+</span>{' '}
      <span className="font-sans text-[0.56rem] uppercase tracking-label text-brand-slate/70">mixed</span>
    </span>
  )
}

/** The extras cell: a count whose tooltip itemises where the pages come from. */
function ExtrasCell({ c }: { c: ComicRowModel }) {
  const b = c.breakdown
  if (b.extras === 0) return <span className="text-brand-slate/50">—</span>
  const parts = [
    b.cover ? 'cover 1' : null,
    b.insideCovers ? `inside covers ${b.insideCovers}` : null,
    b.backCover ? 'back cover 1' : null,
    b.activities ? `activity pages ${b.activities}` : null,
  ].filter(Boolean)
  return (
    <span className="tabular-nums underline decoration-dotted decoration-brand-slate/50 underline-offset-2" title={parts.join(' · ')}>
      {b.extras}
    </span>
  )
}

const TH =
  'px-3 py-2 text-left font-sans text-[0.6rem] uppercase tracking-label text-brand-slate font-normal whitespace-nowrap'
const TD = 'px-3 py-2.5 align-middle text-[0.82rem] text-brand-indigo'

// ── Comic rows ────────────────────────────────────────────────────────────────

function ComicRows({ comics, currency }: { comics: ComicRowModel[]; currency: string }) {
  return (
    <table className="w-full min-w-[46rem] border-collapse">
      <thead>
        <tr className="border-b border-brand-pale-dusk">
          <th className={TH}>Comic</th>
          <th className={TH}>Status</th>
          <th className={TH}>Interior pages</th>
          <th className={`${TH} text-right`} title="Cover (the three options count as one) + inside covers + back cover + activity pages, on actuals">
            Extras
          </th>
          <th className={`${TH} text-right`}>Rate / page</th>
          <th className={`${TH} text-right`}>Delivered</th>
          <th className={`${TH} text-right`}>Contracted</th>
        </tr>
      </thead>
      <tbody>
        {comics.map((c) => (
          <tr key={c.key} className="border-b border-brand-pale-dusk/50 last:border-0 hover:bg-brand-pale-dusk/20">
            <td className={TD}>
              <Link
                href={c.href}
                className="underline decoration-brand-gold/60 underline-offset-2 hover:decoration-brand-gold"
              >
                {c.title}
              </Link>
              {c.complete ? (
                <span className="ml-2 font-sans text-[0.56rem] uppercase tracking-label text-brand-indigo/70">
                  complete
                </span>
              ) : null}
            </td>
            <td className={`${TD} whitespace-nowrap`}>
              <StatusDot status={c.status} />
            </td>
            <td className={`${TD} whitespace-nowrap`}>
              <div className="flex items-center gap-2.5">
                <span className="tabular-nums">
                  {n(c.pagesMade)}
                  <span className="text-brand-slate/60"> / {c.pagesTarget ? n(c.pagesTarget) : '—'}</span>
                </span>
                <ProgressBar value={c.progress} />
              </div>
            </td>
            <td className={`${TD} text-right`}>
              <ExtrasCell c={c} />
            </td>
            <td className={`${TD} text-right`}>
              <RateCell rate={c.rate} source={c.rateSource} currency={currency} />
            </td>
            <td className={`${TD} text-right tabular-nums`}>{formatMoney(c.delivered, currency)}</td>
            <td className={`${TD} text-right tabular-nums text-brand-slate`}>{formatMoney(c.contracted, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Column headers shared by line and program rows ────────────────────────────

function RowHeader() {
  return (
    <div
      aria-hidden
      className={`hidden ${ROW_GRID} px-5 pb-1 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate`}
    >
      <span>Line</span>
      <span>Status mix</span>
      <span>Interior progress</span>
      <span className="text-right">Rate / page</span>
      <span className="text-right">Delivered</span>
    </div>
  )
}

// ── Program + line ────────────────────────────────────────────────────────────

function ProgramBlock({ node, currency }: { node: ProgramNode; currency: string }) {
  const [open, setOpen] = useState(false)
  const t = node.tally
  return (
    <div className="border-t border-brand-pale-dusk/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`w-full ${ROW_GRID} px-5 py-3 text-left hover:bg-brand-pale-dusk/20`}
      >
        <span className="flex min-w-0 items-baseline gap-2 pl-4">
          <span aria-hidden className="font-sans text-[0.7rem] text-brand-slate">{open ? '−' : '+'}</span>
          <span className="min-w-0">
            <span className="block truncate font-sans text-[0.82rem] text-brand-indigo">{t.label}</span>
            <span className="block font-sans text-[0.66rem] text-brand-slate">
              {n(t.comics)} {t.comics === 1 ? 'comic' : 'comics'} · {n(t.complete)} fully drawn
            </span>
          </span>
        </span>
        <span className="hidden md:block"><PipelineBar t={t} /></span>
        <span className="mt-2 md:mt-0 block"><ProgressBar value={t.progress} /></span>
        <span className="hidden text-right font-sans text-[0.75rem] text-brand-indigo md:block">
          <RatesSummary rates={t.rates} currency={currency} />
        </span>
        <span className="mt-1 md:mt-0 block text-right font-sans text-[0.8rem] tabular-nums text-brand-indigo">
          {formatMoneyShort(t.delivered, currency)}
        </span>
      </button>
      {open ? (
        <div className="overflow-x-auto px-5 pb-5">
          <ComicRows comics={node.comics} currency={currency} />
        </div>
      ) : null}
    </div>
  )
}

function LineBlock({ node, currency, defaultOpen }: { node: LineNode; currency: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const t = node.tally
  // A line whose comics all sit in one (or no) program has nothing to gain from
  // a program tier — it would be a single row wrapping the same list.
  const meaningfulPrograms = node.programs.length > 1

  return (
    <section className="overflow-hidden rounded-xl border border-brand-pale-dusk bg-white shadow-[0_1px_2px_rgba(43,42,86,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`w-full ${ROW_GRID} px-5 py-4 text-left hover:bg-brand-pale-dusk/20`}
      >
        <span className="flex min-w-0 items-baseline gap-3">
          <span aria-hidden className="font-sans text-[0.8rem] text-brand-slate">{open ? '−' : '+'}</span>
          <span className="min-w-0">
            <h2 className="truncate font-serif text-[1.15rem] leading-tight text-brand-indigo">{t.label}</h2>
            <span className="mt-0.5 block font-sans text-[0.68rem] text-brand-slate">
              {n(t.comics)} comics · {n(t.complete)} fully drawn · {n(t.pagesMade)}/{n(t.pagesTarget)} interior
              {t.pagesExtras > 0 ? ` · ${n(t.pagesExtras)} extra pages` : ''}
            </span>
          </span>
        </span>
        <span className="mt-3 md:mt-0 block"><PipelineBar t={t} /></span>
        <span className="mt-2 md:mt-0 block"><ProgressBar value={t.progress} /></span>
        <span className="hidden text-right font-sans text-[0.78rem] text-brand-indigo md:block">
          <RatesSummary rates={t.rates} currency={currency} />
        </span>
        <span
          className="mt-1 md:mt-0 block text-right font-sans text-[0.9rem] tabular-nums text-brand-indigo"
          title={`Contracted ${formatMoney(t.contracted, currency)}`}
        >
          {formatMoneyShort(t.delivered, currency)}
        </span>
      </button>

      {open ? (
        meaningfulPrograms ? (
          <div>
            {node.programs.map((p) => (
              <ProgramBlock key={p.tally.key} node={p} currency={currency} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-brand-pale-dusk/60 px-5 pb-5 pt-2">
            <ComicRows comics={node.comics} currency={currency} />
          </div>
        )
      ) : null}
    </section>
  )
}

// ── Trend ─────────────────────────────────────────────────────────────────────

/**
 * Script activity by month. Deliberately NOT value-over-time: the catalog
 * records a current page count per comic and no per-page dates, so a
 * delivered-value history would be invented. The caption says so.
 */
function Trend({ points }: { points: TrendPoint[] }) {
  const recent = points.slice(-24)
  if (recent.length < 2) return null
  const peak = Math.max(...recent.map((p) => Math.max(p.started, p.touched)), 1)

  return (
    <section className="rounded-xl border border-brand-pale-dusk bg-white p-6">
      <h2 className="font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">
        Script activity by month
      </h2>
      <div className="mt-5 flex h-28 items-end gap-1">
        {recent.map((p) => (
          <div
            key={p.month}
            className="flex flex-1 flex-col justify-end gap-px"
            title={`${p.month} — ${p.touched} edited, ${p.started} started`}
          >
            <span className="block w-full rounded-t-sm bg-brand-lavender/70" style={{ height: `${(p.touched / peak) * 100}%` }} />
            <span className="block w-full bg-brand-indigo" style={{ height: `${(p.started / peak) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-sans text-[0.62rem] text-brand-slate">
        <span>{recent[0].month}</span>
        <span>{recent[recent.length - 1].month}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-2 font-sans text-[0.7rem] text-brand-slate">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-brand-indigo" /> scripts started
        </span>
        <span className="flex items-center gap-2 font-sans text-[0.7rem] text-brand-slate">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-brand-lavender/70" /> scripts edited
        </span>
      </div>
      <p className="mt-3 max-w-prose font-sans text-[0.7rem] leading-relaxed text-brand-slate">
        Built from each script’s creation date and its dated changelog entries. Art carries no
        per-page date in the catalog — only a current count — so this is authoring activity, not
        pages drawn over time.
      </p>
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SELECT_CLS =
  'rounded-md border border-brand-pale-dusk bg-white px-3 py-2 font-sans text-[0.78rem] text-brand-indigo outline-none focus:border-brand-slate'

export function ProductionDashboard({
  comics,
  lines,
  programs,
  pricing,
  canAdmin,
}: {
  comics: Comic[]
  lines: Line[] | null
  programs: Program[] | null
  pricing: PricingConfig | null
  canAdmin: boolean
}) {
  const [scope, setScope] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')

  const currency = pricing?.currency ?? 'INR'

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return comics.filter((c) => {
      if (scope !== 'all' && c.line !== scope) return false
      if (statusFilter !== 'all' && (c.status ?? '').replace(/_/g, '-').toLowerCase() !== statusFilter)
        return false
      if (!q) return true
      return (
        (c.title ?? '').toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.subject_slug ?? '').toLowerCase().includes(q) ||
        (c.program_slug ?? '').toLowerCase().includes(q)
      )
    })
  }, [comics, scope, statusFilter, query])

  const model = useMemo(() => buildModel(filtered, lines, programs, pricing), [filtered, lines, programs, pricing])
  const trend = useMemo(() => buildTrend(filtered), [filtered])
  const allLineSlugs = useMemo(() => Array.from(new Set(comics.map((c) => c.line))).sort(), [comics])
  const lineTitle = (slug: string) => lines?.find((l) => l.slug === slug)?.title ?? slug

  function downloadCsv() {
    const rows = exportRows(model, currency)
    if (rows.length === 0) return
    const cols = Object.keys(rows[0])
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
    // BOM so Excel opens ₹ and the em dashes correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `production-status-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="mx-auto max-w-[1200px] px-6 pb-24 pt-10 md:pt-14">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <span className="flex items-center gap-3">
            <span aria-hidden className="block h-px w-7 bg-brand-gold" />
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">Studio status</span>
          </span>
          <h1 className="mt-3 font-serif font-light leading-tight text-brand-umber text-[2rem] md:text-[2.6rem]">
            Production status
          </h1>
          <p className="mt-2 max-w-xl font-serif text-brand-umber/70 leading-relaxed">
            Every comic you can see, what is drawn, and what it is worth. Open a line for its
            series, open a series for its books.
          </p>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded-full border border-brand-pale-dusk bg-white px-4 py-1.5 font-sans text-[0.72rem] text-brand-slate transition hover:border-brand-slate"
          >
            Download CSV
          </button>
          {canAdmin ? (
            <Link
              href="/admin?tab=pricing"
              className="rounded-full border border-brand-gold bg-brand-gold/15 px-4 py-1.5 font-sans text-[0.72rem] text-brand-indigo transition hover:bg-brand-gold/25"
            >
              Set rates
            </Link>
          ) : null}
        </div>
      </header>

      {/* ── Headline ── */}
      <div className="mt-8 border-y border-brand-pale-dusk py-7">
        <Headline t={model.studio} currency={currency} />
      </div>

      {/* ── Filters ── */}
      <div className="mt-7 flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex flex-col gap-1">
          <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">Line</span>
          <select
            aria-label="Filter by line"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="all">All lines</option>
            {allLineSlugs.map((slug) => (
              <option key={slug} value={slug}>
                {lineTitle(slug)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">Status</span>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="all">Any status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s]?.label ?? s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 sm:max-w-xs">
          <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a comic…"
            aria-label="Find a comic"
            className={`${SELECT_CLS} placeholder:text-brand-slate/60`}
          />
        </label>
      </div>

      {/* ── Lines ── */}
      <div className="mt-6 flex flex-col gap-3">
        {model.comics.length === 0 ? (
          <p className="rounded-xl border border-brand-pale-dusk bg-white px-4 py-10 text-center font-sans text-[0.8rem] text-brand-slate">
            No comics match this view.
          </p>
        ) : (
          <>
            <RowHeader />
            {model.lines.map((l) => (
              <LineBlock key={l.tally.key} node={l} currency={currency} defaultOpen={model.lines.length === 1} />
            ))}
          </>
        )}
      </div>

      {/* ── Trend ── */}
      <div className="mt-8">
        <Trend points={trend} />
      </div>

      <p className="mt-6 max-w-prose font-sans text-[0.72rem] leading-relaxed text-brand-slate">
        <strong className="font-semibold text-brand-indigo">Delivered</strong> counts every drawn page —
        interior art, the cover (the three cover options count as one page), inside covers, the back
        cover and activity pages on actuals — times its rate.{' '}
        <strong className="font-semibold text-brand-indigo">Contracted</strong> is the interior pages each
        script commits to, times the same rate. Rates resolve per comic first, then per line, then the
        studio default of {formatMoney(pricing?.defaultRatePerPage ?? 250, currency)} a page.
        {pricing?.updatedAt ? ` Rates last changed ${String(pricing.updatedAt).slice(0, 10)}.` : ''}
      </p>
    </main>
  )
}

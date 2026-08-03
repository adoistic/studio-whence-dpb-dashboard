'use client'

/**
 * Production dashboard — bird's eye down to a single comic.
 *
 * Four altitudes on one page, each one an expansion of the row above it:
 *   Studio headline → Line → Program → Comic.
 *
 * Every number comes from `buildModel`, so the headline is arithmetically the
 * sum of the rows underneath. Nothing here is typed in.
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

// ── Headline ──────────────────────────────────────────────────────────────────

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:px-7 first:sm:pl-0 py-4 sm:py-0">
      <div className="font-serif font-light leading-[0.9] text-4xl md:text-[3rem] text-brand-indigo">{value}</div>
      <div className="flex flex-col gap-2">
        <span aria-hidden className="block w-7 h-px bg-brand-gold" />
        <div className="text-[0.7rem] uppercase tracking-label font-sans text-brand-slate">{label}</div>
        {sub ? <div className="font-sans text-[0.72rem] text-brand-slate/80">{sub}</div> : null}
      </div>
    </div>
  )
}

function Headline({ t, currency }: { t: Tally; currency: string }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-brand-pale-dusk">
      <Tile label="Comics in production" value={n(t.comics)} sub={`${n(t.complete)} fully drawn`} />
      <Tile label="Pages drawn" value={n(t.pagesMade)} sub={`of ${n(t.pagesTarget)} targeted · ${pct(t.progress)}`} />
      <Tile
        label="Delivered value"
        value={formatMoneyShort(t.delivered, currency)}
        sub="pages drawn × their rate"
      />
      <Tile
        label="Contracted value"
        value={formatMoneyShort(t.contracted, currency)}
        sub="every page each script commits to"
      />
    </dl>
  )
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function PipelineBar({ t }: { t: Tally }) {
  const total = t.comics
  const present = STATUS_ORDER.filter((s) => (t.byStatus[s] ?? 0) > 0)
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-brand-pale-dusk" title={
      present.map((s) => `${STATUS_META[s]?.label ?? s}: ${t.byStatus[s]}`).join(' · ')
    }>
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
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-brand-pale-dusk">
        <span className="block h-full bg-brand-indigo" style={{ width: `${v * 100}%` }} />
      </div>
      <span className="font-sans text-[0.72rem] tabular-nums text-brand-slate">{pct(value)}</span>
    </div>
  )
}

/**
 * A rate cell that always says where the number came from.
 *
 * An overridden comic is marked, because "why is this one ₹400?" is the first
 * question anybody asks of a per-page price and the answer should not require
 * opening the admin panel.
 */
function RateCell({ rate, source, currency }: { rate: number; source: string; currency: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="tabular-nums">{formatMoney(rate, currency)}</span>
      {source === 'comic' ? (
        <span
          className="rounded-sm bg-brand-gold/25 px-1 py-px font-sans text-[0.58rem] uppercase tracking-label text-brand-indigo"
          title="This comic has its own rate, set by an admin — it overrides the line rate."
        >
          override
        </span>
      ) : source === 'default' ? (
        <span
          className="font-sans text-[0.58rem] uppercase tracking-label text-brand-slate/70"
          title="No rate set for this line, so the studio default applies."
        >
          default
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
      <span className="tabular-nums">
        {formatMoney(rates[0], currency)}–{formatMoney(rates[rates.length - 1], currency)}
      </span>{' '}
      <span className="font-sans text-[0.58rem] uppercase tracking-label text-brand-slate/70">mixed</span>
    </span>
  )
}

const TH = 'px-3 py-2 text-left font-sans text-[0.62rem] uppercase tracking-label text-brand-slate font-normal'
const TD = 'px-3 py-2 align-middle text-[0.82rem] text-brand-indigo'

// ── Comic rows ────────────────────────────────────────────────────────────────

function ComicRows({ comics, currency }: { comics: ComicRowModel[]; currency: string }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-brand-pale-dusk">
          <th className={TH}>Comic</th>
          <th className={TH}>Status</th>
          <th className={`${TH} text-right`}>Pages</th>
          <th className={TH}>Progress</th>
          <th className={`${TH} text-right`}>Rate / page</th>
          <th className={`${TH} text-right`}>Delivered</th>
          <th className={`${TH} text-right`}>Contracted</th>
        </tr>
      </thead>
      <tbody>
        {comics.map((c) => (
          <tr key={c.key} className="border-b border-brand-pale-dusk/50 last:border-0 hover:bg-brand-pale-dusk/20">
            <td className={TD}>
              <Link href={c.href} className="underline decoration-brand-gold/60 underline-offset-2 hover:decoration-brand-gold">
                {c.title}
              </Link>
              {c.complete ? (
                <span className="ml-2 font-sans text-[0.58rem] uppercase tracking-label text-brand-indigo/70">
                  complete
                </span>
              ) : null}
            </td>
            <td className={`${TD} whitespace-nowrap`}>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_META[c.status]?.bar ?? 'bg-brand-slate'}`} />
                <span className="font-sans text-[0.72rem] text-brand-slate">{STATUS_META[c.status]?.label ?? c.status}</span>
              </span>
            </td>
            <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>
              {n(c.pagesMade)}
              <span className="text-brand-slate/60"> / {c.pagesTarget ? n(c.pagesTarget) : '—'}</span>
            </td>
            <td className={TD}><ProgressBar value={c.progress} /></td>
            <td className={`${TD} text-right`}><RateCell rate={c.rate} source={c.rateSource} currency={currency} /></td>
            <td className={`${TD} text-right tabular-nums`}>{formatMoney(c.delivered, currency)}</td>
            <td className={`${TD} text-right tabular-nums text-brand-slate`}>{formatMoney(c.contracted, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-brand-pale-dusk/20"
      >
        <span aria-hidden className="w-3 shrink-0 font-sans text-[0.7rem] text-brand-slate">{open ? '−' : '+'}</span>
        <span className="min-w-0 flex-1 truncate font-sans text-[0.8rem] text-brand-indigo">{t.label}</span>
        <span className="hidden shrink-0 font-sans text-[0.72rem] tabular-nums text-brand-slate sm:block">
          {n(t.comics)} {t.comics === 1 ? 'comic' : 'comics'}
        </span>
        <span className="hidden w-40 shrink-0 md:block"><ProgressBar value={t.progress} /></span>
        <span className="shrink-0 font-sans text-[0.78rem] tabular-nums text-brand-indigo">
          {formatMoneyShort(t.delivered, currency)}
        </span>
      </button>
      {open ? <div className="overflow-x-auto px-4 pb-4"><ComicRows comics={node.comics} currency={currency} /></div> : null}
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
    <section className="overflow-hidden rounded-lg border border-brand-pale-dusk bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 text-left hover:bg-brand-pale-dusk/20"
      >
        <span aria-hidden className="w-3 shrink-0 font-sans text-brand-slate">{open ? '−' : '+'}</span>
        <span className="min-w-0 flex-1">
          {/* A real heading, so the page has an outline a screen reader can
              navigate — and so "Biographies the line" is distinguishable from
              "Biographies the filter pill". */}
          <h2 className="font-serif text-lg leading-tight text-brand-indigo">{t.label}</h2>
          <span className="mt-1 block font-sans text-[0.7rem] text-brand-slate">
            {n(t.comics)} comics · {n(t.complete)} fully drawn · {n(t.pagesMade)} of {n(t.pagesTarget)} pages
          </span>
        </span>
        <span className="w-full sm:w-44"><PipelineBar t={t} /></span>
        <span className="w-32 shrink-0"><ProgressBar value={t.progress} /></span>
        <span className="w-24 shrink-0 text-right font-sans text-[0.75rem] text-brand-slate">
          <RatesSummary rates={t.rates} currency={currency} />
        </span>
        <span className="w-24 shrink-0 text-right font-sans text-[0.85rem] tabular-nums text-brand-indigo">
          {formatMoneyShort(t.delivered, currency)}
        </span>
      </button>

      {open ? (
        meaningfulPrograms ? (
          <div>{node.programs.map((p) => <ProgramBlock key={p.tally.key} node={p} currency={currency} />)}</div>
        ) : (
          <div className="overflow-x-auto border-t border-brand-pale-dusk/60 px-4 pb-4 pt-2">
            <ComicRows comics={node.comics} currency={currency} />
          </div>
        )
      ) : null}
    </section>
  )
}

// ── Trend ─────────────────────────────────────────────────────────────────────

/**
 * Script activity by month.
 *
 * Deliberately NOT a value-over-time chart: the catalog records a current page
 * count per comic and no per-page dates, so any delivered-value history would be
 * invented. The caption says exactly that rather than letting the axis imply it.
 */
function Trend({ points }: { points: TrendPoint[] }) {
  const recent = points.slice(-24)
  if (recent.length < 2) return null
  const peak = Math.max(...recent.map((p) => Math.max(p.started, p.touched)), 1)

  return (
    <section className="rounded-lg border border-brand-pale-dusk bg-white p-5">
      <h2 className="font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">Script activity by month</h2>
      <div className="mt-5 flex h-32 items-end gap-1">
        {recent.map((p) => (
          <div key={p.month} className="group relative flex flex-1 flex-col justify-end gap-px" title={`${p.month} — ${p.touched} edited, ${p.started} started`}>
            <span className="block w-full bg-brand-lavender/70" style={{ height: `${(p.touched / peak) * 100}%` }} />
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
        Built from each script’s creation date and its dated changelog entries. Art has no per-page date
        anywhere in the catalog — only a current count — so this is authoring activity, not pages drawn
        over time.
      </p>
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Scope = 'all' | string

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
  const [scope, setScope] = useState<Scope>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [query, setQuery] = useState('')

  const currency = pricing?.currency ?? 'INR'

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return comics.filter((c) => {
      if (scope !== 'all' && c.line !== scope) return false
      if (statusFilter !== 'all' && (c.status ?? '').replace(/_/g, '-').toLowerCase() !== statusFilter) return false
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

  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 font-sans text-[0.7rem] transition ${
      active
        ? 'border-brand-indigo bg-brand-indigo text-white'
        : 'border-brand-pale-dusk text-brand-slate hover:border-brand-slate'
    }`

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-light text-brand-indigo">Production status</h1>
          <p className="mt-2 max-w-prose font-sans text-[0.8rem] leading-relaxed text-brand-slate">
            Every comic in the studio, what is drawn, and what it is worth. Open a line to see its
            programs, open a program to see its books.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded-full border border-brand-pale-dusk px-4 py-1.5 font-sans text-[0.72rem] text-brand-slate hover:border-brand-slate"
          >
            Download CSV
          </button>
          {canAdmin ? (
            <Link
              href="/admin"
              className="rounded-full border border-brand-gold bg-brand-gold/15 px-4 py-1.5 font-sans text-[0.72rem] text-brand-indigo hover:bg-brand-gold/25"
            >
              Set rates
            </Link>
          ) : null}
        </div>
      </header>

      <div className="border-y border-brand-pale-dusk py-6">
        <Headline t={model.studio} currency={currency} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={pill(scope === 'all')} onClick={() => setScope('all')}>
          All lines
        </button>
        {allLineSlugs.map((slug) => (
          <button key={slug} type="button" className={pill(scope === slug)} onClick={() => setScope(slug)}>
            {lines?.find((l) => l.slug === slug)?.title ?? slug}
          </button>
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-brand-pale-dusk" />
        <button type="button" className={pill(statusFilter === 'all')} onClick={() => setStatusFilter('all')}>
          Any status
        </button>
        {STATUS_ORDER.map((s) => (
          <button key={s} type="button" className={pill(statusFilter === s)} onClick={() => setStatusFilter(s)}>
            {STATUS_META[s]?.label ?? s}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a comic…"
          aria-label="Find a comic"
          className="ml-auto w-48 rounded-full border border-brand-pale-dusk px-4 py-1.5 font-sans text-[0.72rem] text-brand-indigo outline-none placeholder:text-brand-slate/60 focus:border-brand-slate"
        />
      </div>

      {model.comics.length === 0 ? (
        <p className="rounded-lg border border-brand-pale-dusk bg-white px-4 py-8 text-center font-sans text-[0.8rem] text-brand-slate">
          No comics match this view.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {model.lines.map((l) => (
            <LineBlock key={l.tally.key} node={l} currency={currency} defaultOpen={model.lines.length === 1} />
          ))}
        </div>
      )}

      <Trend points={trend} />

      <p className="max-w-prose font-sans text-[0.7rem] leading-relaxed text-brand-slate">
        <strong className="font-semibold text-brand-indigo">Delivered</strong> is pages actually drawn ×
        their rate. <strong className="font-semibold text-brand-indigo">Contracted</strong> is every page
        the scripts commit to × the same rate. Rates resolve per comic first, then per line, then the
        studio default of {formatMoney(pricing?.defaultRatePerPage ?? 250, currency)} a page.
        {pricing?.updatedAt ? ` Rates last changed ${pricing.updatedAt.slice(0, 10)}.` : ''}
      </p>
    </div>
  )
}

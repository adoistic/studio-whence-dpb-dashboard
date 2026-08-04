'use client'

/**
 * The status table — one row per comic, and the whole financial story on one
 * screen (Adnan, 2026-08-04: "I should not have to switch tabs to understand
 * it").
 *
 * Reading order, left to right:
 *   the book → its pages (script · extras · total · generated) → its money
 *   (rate · invoice value · with GST · net after TDS) → the per-deliverable
 *   sign-offs → the invoice trail.
 *
 * A summary strip above the table carries the same totals at a glance —
 * script pages, generated pages, extras, invoice value, GST, with-GST, net —
 * for exactly the rows currently in view.
 *
 * Approvals: each deliverable is signed off in its own column. Marketing
 * remains an internal sign-off and NEVER gates invoicing; the invoice has its
 * own explicit two-step trail (approve for invoice → invoice generated, the
 * second step on the Approved-for-invoice tab).
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Comic, Figure, Line, Program } from '@/types/content'
import {
  approveForInvoice,
  approveStage,
  canApprove,
  useApprovals,
  withdrawInvoiceMark,
  withdrawStage,
  STAGE_LABEL,
  type Stage,
} from '@/lib/approvals'
import {
  buildStatusTable,
  statusTableCsvRows,
  statusTableTotals,
  type StageCell,
  type StatusTableRow,
  type StatusTableTotals,
} from '@/lib/statusTable'
import { formatMoney, formatMoneyShort, type PricingConfig } from '@/lib/pricing'

const n = (v: number) => Math.round(v).toLocaleString('en-IN')

const TH =
  'sticky top-6 z-10 whitespace-nowrap border-b border-brand-pale-dusk bg-white px-3 py-2.5 text-left font-sans text-[0.6rem] font-normal uppercase tracking-label text-brand-slate'
const GROUP_TH =
  'sticky top-0 z-20 h-6 whitespace-nowrap border-b border-brand-pale-dusk/60 bg-white px-3 text-left align-middle font-sans text-[0.56rem] font-semibold uppercase tracking-label text-brand-gold'
const TD =
  'whitespace-nowrap border-b border-brand-pale-dusk/50 px-3 py-2 align-middle font-sans text-[0.78rem] text-brand-indigo'
/** Left rule marking the start of a column group, on header and body alike. */
const GROUP_L = 'border-l border-brand-pale-dusk/60'

/** The stage columns, left to right, in the order work actually happens. */
const STAGE_COLUMNS: Stage[] = ['script', 'dossier', 'illustration', 'covers', 'insideCovers', 'activities', 'marketing']

// ── Summary strip ─────────────────────────────────────────────────────────────

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-brand-pale-dusk bg-white px-4 py-3">
      <div className="font-sans text-[0.58rem] uppercase tracking-label text-brand-slate">{label}</div>
      <div className="mt-1 font-serif text-[1.35rem] font-light leading-none text-brand-umber tabular-nums">
        {value}
      </div>
      {sub ? <div className="mt-1.5 font-sans text-[0.66rem] leading-snug text-brand-slate/90">{sub}</div> : null}
    </div>
  )
}

/** The bird's-eye row: pages on the left, the invoice chain on the right. */
function SummaryStrip({ t, currency }: { t: StatusTableTotals; currency: string }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-7">
      <Tile label="Script pages" value={n(t.scriptPages)} sub="billed from the script, day one" />
      <Tile label="Extras" value={n(t.billedExtras)} sub="covers, inside covers & activities" />
      <Tile
        label="Generated pages"
        value={n(t.generatedPages)}
        sub={`of ${n(t.totalPages)} total · ${formatMoneyShort(t.generatedValue, currency)} of work done`}
      />
      {/* Exact rupees, not the compact form — ₹3,21,432 and ₹3,15,984 must not
          both read "₹3.2 L" when the whole point is telling them apart. */}
      <Tile label="Invoice value" value={formatMoney(t.totalValue, currency)} sub={`${n(t.totalPages)} pages × rate`} />
      <Tile label="GST 18%" value={formatMoney(t.gst, currency)} sub="on the invoice value" />
      <Tile label="With GST" value={formatMoney(t.totalWithGst, currency)} sub="invoice value + GST" />
      <Tile
        label="Net after TDS"
        value={formatMoney(t.netOfTds, currency)}
        sub={`client deducts ${formatMoney(t.tds, currency)} (2% of base)`}
      />
    </div>
  )
}

// ── Cells ─────────────────────────────────────────────────────────────────────

/**
 * One deliverable's cell: what exists, and the approve control for THAT thing.
 *
 * Three states, and only one of them is actionable:
 *   · nothing delivered → the detail, greyed, no button (nothing to approve)
 *   · delivered, unapproved → the detail + an Approve button
 *   · approved → a dated tick, with a × to withdraw
 */
function StageCellView({
  cell, title, canAct, busy, onApprove, onWithdraw,
}: {
  cell: StageCell
  title: string
  canAct: boolean
  busy: boolean
  onApprove: () => void
  onWithdraw: () => void
}) {
  if (cell.approval) {
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className="rounded-full bg-brand-gold/25 px-2 py-0.5 font-sans text-[0.64rem] font-semibold text-brand-indigo"
          title={`${STAGE_LABEL[cell.stage]} approved by ${cell.approval.by} on ${cell.approval.at.slice(0, 10)}`}
        >
          ✓ {cell.approval.at.slice(0, 10)}
        </span>
        {canAct ? (
          <button
            type="button"
            aria-label={`Withdraw ${STAGE_LABEL[cell.stage]} approval for ${title}`}
            disabled={busy}
            onClick={onWithdraw}
            title="Withdraw this approval"
            className="rounded-full px-1 font-sans text-[0.72rem] text-brand-slate transition hover:text-brand-indigo disabled:opacity-40"
          >
            ×
          </button>
        ) : null}
      </span>
    )
  }

  if (!cell.ready) {
    return <span className="font-sans text-[0.72rem] text-brand-slate/50">{cell.detail}</span>
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-sans text-[0.75rem]">{cell.detail}</span>
      {canAct ? (
        <button
          type="button"
          aria-label={`Approve ${STAGE_LABEL[cell.stage]} for ${title}`}
          disabled={busy}
          onClick={onApprove}
          className="rounded-full border border-brand-indigo px-2 py-0.5 font-sans text-[0.6rem] uppercase tracking-label text-brand-indigo transition hover:bg-brand-indigo hover:text-white disabled:opacity-40"
        >
          Approve
        </button>
      ) : null}
    </span>
  )
}

/**
 * The invoice trail cell. Marketing does not gate this — the tooltip counts
 * PRODUCTION sign-offs only, and the button is a human decision either way.
 */
function InvoiceCellView({
  row, canAct, busy, onApprove, onWithdraw,
}: {
  row: StatusTableRow
  canAct: boolean
  busy: boolean
  onApprove: () => void
  onWithdraw: () => void
}) {
  if (row.invoice.generated) {
    return (
      <span
        className="rounded-full bg-brand-indigo px-2 py-0.5 font-sans text-[0.64rem] font-semibold text-white"
        title={`Invoice generated by ${row.invoice.generated.by} on ${row.invoice.generated.at.slice(0, 10)}`}
      >
        Invoiced {row.invoice.generated.at.slice(0, 10)}
      </span>
    )
  }
  if (row.invoice.approved) {
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className="rounded-full bg-brand-gold/25 px-2 py-0.5 font-sans text-[0.64rem] font-semibold text-brand-indigo"
          title={`Approved for invoice by ${row.invoice.approved.by} on ${row.invoice.approved.at.slice(0, 10)} — mark it generated on the Approved-for-invoice tab`}
        >
          ✓ For invoice {row.invoice.approved.at.slice(0, 10)}
        </span>
        {canAct ? (
          <button
            type="button"
            aria-label={`Withdraw invoice approval for ${row.title}`}
            disabled={busy}
            onClick={onWithdraw}
            title="Withdraw the invoice approval"
            className="rounded-full px-1 font-sans text-[0.72rem] text-brand-slate transition hover:text-brand-indigo disabled:opacity-40"
          >
            ×
          </button>
        ) : null}
      </span>
    )
  }
  if (!canAct) return <span className="font-sans text-[0.72rem] text-brand-slate/50">—</span>
  return (
    <button
      type="button"
      aria-label={`Approve ${row.title} for invoice`}
      disabled={busy}
      onClick={onApprove}
      title={`${row.prodApproved} of ${row.prodReady} production sign-offs done (marketing is internal and not required)`}
      className="rounded-full border border-brand-gold bg-brand-gold/10 px-2 py-0.5 font-sans text-[0.6rem] uppercase tracking-label text-brand-indigo transition hover:bg-brand-gold/30 disabled:opacity-40"
    >
      Approve for invoice
    </button>
  )
}

// ── The table ─────────────────────────────────────────────────────────────────

export function StatusTable({
  comics,
  figures,
  lines,
  programs,
  pricing,
  email,
  canModerate,
  canAdmin,
  viewSwitcher,
}: {
  comics: Comic[]
  figures: Figure[] | null
  lines: Line[] | null
  programs: Program[] | null
  pricing: PricingConfig | null
  email: string | null
  canModerate: boolean
  canAdmin: boolean
  viewSwitcher?: React.ReactNode
}) {
  const [scope, setScope] = useState('all')
  const [query, setQuery] = useState('')
  const [onlyUnapproved, setOnlyUnapproved] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const approvals = useApprovals(refreshKey)
  const currency = pricing?.currency ?? 'INR'
  const canAct = canApprove(email, canModerate)

  const allRows = useMemo(
    () =>
      buildStatusTable(
        comics, figures, lines, programs, pricing,
        approvals.data?.stages ?? null, approvals.data?.invoices ?? null,
      ),
    [comics, figures, lines, programs, pricing, approvals.data],
  )

  const allLineSlugs = useMemo(() => Array.from(new Set(comics.map((c) => c.line))).sort(), [comics])
  const lineTitle = (slug: string) => lines?.find((l) => l.slug === slug)?.title ?? slug

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allRows.filter((r) => {
      if (scope !== 'all' && !r.key.startsWith(`${scope}__`)) return false
      // "Needs approval" = at least one delivered stage still unsigned.
      if (onlyUnapproved && r.approvedCount >= r.readyCount) return false
      if (!q) return true
      return (
        r.title.toLowerCase().includes(q) ||
        r.classification.toLowerCase().includes(q) ||
        r.subClassification.toLowerCase().includes(q)
      )
    })
  }, [allRows, scope, query, onlyUnapproved])

  const totals = useMemo(() => statusTableTotals(rows), [rows])

  async function act(busyId: string, fn: () => Promise<void>, okMsg: string) {
    setBusyKey(busyId)
    setNote(null)
    try {
      await fn()
      setRefreshKey((k) => k + 1)
      setNote(okMsg)
    } catch {
      setNote('Could not save — check that you are signed in with an approver account.')
    } finally {
      setBusyKey(null)
    }
  }

  function downloadCsv() {
    const csvRows = statusTableCsvRows(rows, currency)
    if (csvRows.length === 0) return
    const cols = Object.keys(csvRows[0])
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [cols.join(','), ...csvRows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `status-table-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="mx-auto max-w-[1780px] px-6 pb-24 pt-10 md:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <span className="flex items-center gap-3">
            <span aria-hidden className="block h-px w-7 bg-brand-gold" />
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">Studio status</span>
          </span>
          <h1 className="mt-3 font-serif font-light leading-tight text-brand-umber text-[2rem] md:text-[2.6rem]">
            Production status
          </h1>
          <p className="mt-2 max-w-2xl font-serif text-brand-umber/70 leading-relaxed">
            One row per comic: its pages, its value, its sign-offs, its invoice. The strip above the
            table totals whatever is in view.
          </p>
        </div>
        <div className="flex items-center gap-2 pb-1">
          {viewSwitcher}
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

      <SummaryStrip t={totals} currency={currency} />

      <div className="mt-7 flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex flex-col gap-1">
          <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">Line</span>
          <select
            aria-label="Filter by line"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="rounded-md border border-brand-pale-dusk bg-white px-3 py-2 font-sans text-[0.78rem] text-brand-indigo outline-none focus:border-brand-slate"
          >
            <option value="all">All lines</option>
            {allLineSlugs.map((slug) => (
              <option key={slug} value={slug}>{lineTitle(slug)}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[14rem] flex-col gap-1 sm:max-w-xs">
          <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a comic…"
            aria-label="Find a comic"
            className="rounded-md border border-brand-pale-dusk bg-white px-3 py-2 font-sans text-[0.78rem] text-brand-indigo outline-none placeholder:text-brand-slate/60 focus:border-brand-slate"
          />
        </label>
        <label className="mb-2 flex items-center gap-2 font-sans text-[0.72rem] text-brand-slate">
          <input
            type="checkbox"
            checked={onlyUnapproved}
            onChange={(e) => setOnlyUnapproved(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-indigo"
          />
          Only rows with something awaiting approval
        </label>
        {note ? (
          <p role="status" className="mb-2 ml-auto font-sans text-[0.72rem] text-brand-indigo">{note}</p>
        ) : null}
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-brand-pale-dusk bg-white">
        <table className="w-full min-w-[2260px] border-collapse">
          <thead>
            {/* Group row: the four stories the columns tell. */}
            <tr>
              <th className={GROUP_TH} colSpan={3} />
              <th className={`${GROUP_TH} ${GROUP_L}`} colSpan={4}>Pages</th>
              <th className={`${GROUP_TH} ${GROUP_L}`} colSpan={4}>Value ({currency})</th>
              <th className={`${GROUP_TH} ${GROUP_L}`} colSpan={STAGE_COLUMNS.length}>Sign-offs</th>
              <th className={`${GROUP_TH} ${GROUP_L}`}>Invoice</th>
            </tr>
            <tr>
              <th className={TH}>Classification</th>
              <th className={TH}>Sub-classification</th>
              <th className={TH}>Comic</th>
              <th className={`${TH} ${GROUP_L} text-right`}>Script</th>
              <th className={`${TH} text-right`}>Extras</th>
              <th className={`${TH} text-right`}>Total</th>
              <th className={`${TH} text-right`}>Generated</th>
              <th className={`${TH} ${GROUP_L} text-right`}>Rate</th>
              <th className={`${TH} text-right`}>Invoice value</th>
              <th className={`${TH} text-right`}>With GST</th>
              <th className={`${TH} text-right`}>Net after TDS</th>
              {STAGE_COLUMNS.map((s, i) => (
                <th key={s} className={`${TH} ${i === 0 ? GROUP_L : ''}`}>{STAGE_LABEL[s]}</th>
              ))}
              <th className={`${TH} ${GROUP_L}`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const groupStart = i === 0 || r.classification !== rows[i - 1].classification
              const pagesTitle =
                `Script pages: ${r.billed.interior}` +
                (r.billed.interiorSource === 'produced'
                  ? ` (actually produced — overrides the scripted ${r.target || '—'})`
                  : ' (from the script)') +
                `\nExtras billed: ${r.billed.extras} (${
                  r.billed.extrasSource === 'override'
                    ? 'set for this book'
                    : r.billed.extrasSource === 'produced'
                      ? 'actually produced'
                      : 'standard allotment'
                }; ${r.billed.actualExtras} made so far)` +
                `\nGenerated so far: ${r.generatedPages} pages = ${formatMoney(r.generatedValue, currency)}`
              return (
                <tr
                  key={r.key}
                  className={`${groupStart ? 'border-t-2 border-t-brand-pale-dusk' : ''} hover:bg-brand-pale-dusk/20`}
                >
                  <td className={`${TD} ${groupStart ? '' : 'text-brand-slate/50'}`}>{r.classification}</td>
                  <td className={TD}>{r.subClassification}</td>
                  <td className={TD}>
                    <Link
                      href={r.href}
                      className="underline decoration-brand-gold/60 underline-offset-2 hover:decoration-brand-gold"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className={`${TD} ${GROUP_L} text-right tabular-nums`} title={pagesTitle}>
                    {n(r.billed.interior)}
                  </td>
                  <td className={`${TD} text-right tabular-nums`} title={pagesTitle}>
                    {n(r.billed.extras)}
                  </td>
                  <td className={`${TD} text-right font-semibold tabular-nums`} title={pagesTitle}>
                    {n(r.totalPages)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-brand-slate`} title={pagesTitle}>
                    {n(r.generatedPages)}
                    <span className="text-brand-slate/50"> / {n(r.totalPages)}</span>
                  </td>
                  <td className={`${TD} ${GROUP_L} text-right tabular-nums`}>
                    {formatMoney(r.rate, currency)}
                    {r.rateSource === 'comic' ? (
                      <span
                        className="ml-1 rounded-sm bg-brand-gold/25 px-1 font-sans text-[0.54rem] uppercase tracking-label"
                        title="Per-comic override"
                      >
                        o
                      </span>
                    ) : null}
                  </td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>
                    {formatMoney(r.totalValue, currency)}
                  </td>
                  <td
                    className={`${TD} text-right tabular-nums`}
                    title={`GST 18% = ${formatMoney(r.gst, currency)}`}
                  >
                    {formatMoney(r.totalWithGst, currency)}
                  </td>
                  <td
                    className={`${TD} text-right font-semibold tabular-nums`}
                    title={`TDS 2% of the invoice value = ${formatMoney(r.tds, currency)}, deducted by the client at payment`}
                  >
                    {formatMoney(r.netOfTds, currency)}
                  </td>
                  {STAGE_COLUMNS.map((s, si) => {
                    const busyId = `${r.key}::${s}`
                    return (
                      <td key={s} className={`${TD} ${si === 0 ? GROUP_L : ''}`}>
                        <StageCellView
                          cell={r.stages[s]}
                          title={r.title}
                          canAct={canAct}
                          busy={busyKey === busyId}
                          onApprove={() =>
                            void act(
                              busyId,
                              () => approveStage(r.key, s, email ?? ''),
                              `${STAGE_LABEL[s]} approved for ${r.title}.`,
                            )
                          }
                          onWithdraw={() =>
                            void act(
                              busyId,
                              () => withdrawStage(r.key, s, email ?? ''),
                              `${STAGE_LABEL[s]} approval withdrawn for ${r.title}.`,
                            )
                          }
                        />
                      </td>
                    )
                  })}
                  <td className={`${TD} ${GROUP_L}`}>
                    <InvoiceCellView
                      row={r}
                      canAct={canAct}
                      busy={busyKey === `${r.key}::invoice`}
                      onApprove={() =>
                        void act(
                          `${r.key}::invoice`,
                          () => approveForInvoice(r.key, email ?? ''),
                          `${r.title} approved for invoice — it is now on the Approved-for-invoice tab.`,
                        )
                      }
                      onWithdraw={() =>
                        void act(
                          `${r.key}::invoice`,
                          () => withdrawInvoiceMark(r.key, 'approved', email ?? ''),
                          `Invoice approval withdrawn for ${r.title}.`,
                        )
                      }
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-brand-pale-dusk bg-brand-pale-dusk/20">
              <td className={`${TD} font-semibold`} colSpan={3}>
                Total · {n(totals.comics)} comics
              </td>
              <td className={`${TD} ${GROUP_L} text-right font-semibold tabular-nums`}>{n(totals.scriptPages)}</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{n(totals.billedExtras)}</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{n(totals.totalPages)}</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{n(totals.generatedPages)}</td>
              <td className={`${TD} ${GROUP_L}`} />
              <td className={`${TD} text-right font-semibold tabular-nums`}>
                {formatMoney(totals.totalValue, currency)}
              </td>
              <td className={`${TD} text-right font-semibold tabular-nums`} title={`GST 18% = ${formatMoney(totals.gst, currency)}`}>
                {formatMoney(totals.totalWithGst, currency)}
              </td>
              <td className={`${TD} text-right font-semibold tabular-nums`} title={`TDS 2% = ${formatMoney(totals.tds, currency)}`}>
                {formatMoney(totals.netOfTds, currency)}
              </td>
              <td className={`${TD} ${GROUP_L} font-semibold`} colSpan={STAGE_COLUMNS.length}>
                {n(totals.approvedStages)} of {n(totals.readyStages)} delivered stages approved
              </td>
              <td className={`${TD} ${GROUP_L} font-semibold`}>
                {n(totals.approvedForInvoice)} approved · {n(totals.invoicesGenerated)} invoiced
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-brand-pale-dusk bg-white px-4 py-8 text-center font-sans text-[0.8rem] text-brand-slate">
          No comics match this view.
        </p>
      ) : null}

      <p className="mt-6 max-w-3xl font-sans text-[0.72rem] leading-relaxed text-brand-slate">
        <strong className="font-semibold text-brand-indigo">Pages.</strong> A book bills its{' '}
        <strong className="font-semibold text-brand-indigo">script</strong> pages from the day the script exists,
        plus a standard <strong className="font-semibold text-brand-indigo">eight extras</strong> (front cover, back
        cover, the inside covers and four activity pages). The moment production goes past the plan, the{' '}
        <strong className="font-semibold text-brand-indigo">produced count takes over</strong> — a book scripted at
        48 that grows to 52 bills 52 + 8 = 60, automatically. Generated counts the pages that actually exist today;
        hover any page number for the split.
      </p>
      <p className="mt-3 max-w-3xl font-sans text-[0.72rem] leading-relaxed text-brand-slate">
        <strong className="font-semibold text-brand-indigo">Money.</strong> Invoice value = total pages × the rate
        (per-comic override → line rate → studio default). GST is 18% on the invoice value (the amount is in the
        strip above, and on hover). TDS is 2% <strong className="font-semibold text-brand-indigo">of the invoice
        value only</strong>, never of the GST-inclusive figure: ₹100 base → ₹18 GST → ₹118 invoice → ₹2 TDS → ₹116
        net receivable.
      </p>
      <p className="mt-3 max-w-3xl font-sans text-[0.72rem] leading-relaxed text-brand-slate">
        <strong className="font-semibold text-brand-indigo">Invoicing.</strong> Approve a book for invoice in the
        last column — marketing review is internal and never gates it. The book then appears on the{' '}
        <strong className="font-semibold text-brand-indigo">Approved for invoice</strong> tab, where the raised
        invoice is marked as generated. Every mark is attributed and dated.
      </p>
    </main>
  )
}

'use client'

/**
 * The status table — one row per comic, every deliverable its own column, and
 * every deliverable carrying its OWN approve button right there in the cell.
 *
 * There is deliberately no single overall "approve this book" control: nobody
 * signs off a whole book in one act, and a lone button at the end of the row
 * meant Diamond had to decide what it even covered. Approving the illustration
 * happens in the Illustration column, the covers in the Covers column, and so
 * on — each one attributed and dated on its own.
 *
 * Everything except those approvals is derived from delivered content, so a
 * stage with nothing in it simply has no button: you cannot sign off an empty
 * cell, and you cannot mark a delivered thing "not received".
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Comic, Figure, Line, Program } from '@/types/content'
import {
  approveStage,
  canApprove,
  useApprovals,
  withdrawStage,
  STAGE_LABEL,
  type ComicApprovals,
  type Stage,
} from '@/lib/approvals'
import { buildStatusTable, statusTableCsvRows, statusTableTotals, type StageCell, type StatusTableRow } from '@/lib/statusTable'
import { formatMoney, type PricingConfig } from '@/lib/pricing'

const n = (v: number) => Math.round(v).toLocaleString('en-IN')

const TH =
  'sticky top-0 z-10 whitespace-nowrap border-b border-brand-pale-dusk bg-white px-3 py-2.5 text-left font-sans text-[0.6rem] font-normal uppercase tracking-label text-brand-slate'
const TD =
  'whitespace-nowrap border-b border-brand-pale-dusk/50 px-3 py-2 align-middle font-sans text-[0.78rem] text-brand-indigo'

/** The stage columns, left to right, in the order work actually happens. */
const STAGE_COLUMNS: Stage[] = ['script', 'dossier', 'illustration', 'covers', 'insideCovers', 'activities', 'marketing']

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
    () => buildStatusTable(comics, figures, lines, programs, pricing, approvals.data),
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

  const approvalsOf = (key: string): ComicApprovals => approvals.data?.[key] ?? {}

  // Group separators: a heavier border whenever the classification changes.
  let prevClassification = ''

  return (
    <main className="mx-auto max-w-[1700px] px-6 pb-24 pt-10 md:pt-14">
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
            One row per comic, one column per deliverable. Approve each thing where you see it —
            the illustration in its column, the covers in theirs. Everything else reads straight
            off what has been delivered.
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
        <table className="w-full min-w-[1640px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>Classification</th>
              <th className={TH}>Sub-classification</th>
              <th className={TH}>Comic</th>
              <th className={`${TH} text-right`}>Total pages</th>
              <th className={`${TH} text-right`}>Rate</th>
              <th className={`${TH} text-right`}>Total value</th>
              {STAGE_COLUMNS.map((s) => (
                <th key={s} className={TH}>{STAGE_LABEL[s]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const groupStart = r.classification !== prevClassification
              prevClassification = r.classification
              const b = r.breakdown
              const totalTitle = `${b.interior} interior · cover ${b.cover} · back cover ${b.backCover} · IFC ${b.insideFront} · IBC ${b.insideBack} · activity pages ${b.activities}`
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
                  <td className={`${TD} text-right font-semibold tabular-nums`} title={totalTitle}>
                    {n(r.totalPages)}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
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
                  {STAGE_COLUMNS.map((s) => {
                    const busyId = `${r.key}::${s}`
                    return (
                      <td key={s} className={TD}>
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
                              () => withdrawStage(r.key, s, approvalsOf(r.key), email ?? ''),
                              `${STAGE_LABEL[s]} approval withdrawn for ${r.title}.`,
                            )
                          }
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-brand-pale-dusk bg-brand-pale-dusk/20">
              <td className={`${TD} font-semibold`} colSpan={3}>
                Total · {n(totals.comics)} comics
              </td>
              <td className={`${TD} text-right font-semibold tabular-nums`} title={
                `${n(totals.interior)} interior · ${n(totals.covers)} covers · ${n(totals.insideCovers)} IFC/IBC · ${n(totals.activities)} activity pages`
              }>
                {n(totals.totalPages)}
              </td>
              <td className={TD} />
              <td className={`${TD} text-right font-semibold tabular-nums`}>
                {formatMoney(totals.totalValue, currency)}
              </td>
              <td className={`${TD} font-semibold`} colSpan={STAGE_COLUMNS.length}>
                {n(totals.approvedStages)} of {n(totals.readyStages)} delivered stages approved
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
        Counting: the three cover options count as <strong className="font-semibold text-brand-indigo">one</strong> cover
        page; the back cover is one; the inside front cover and inside back cover are{' '}
        <strong className="font-semibold text-brand-indigo">separate pages, one each</strong>; activity pages count on
        actuals. Total value = total pages × the rate (per-comic override → line rate → studio default).
        A stage with nothing delivered has no Approve button — you cannot sign off an empty cell.
        The approval ledger was reset on 2026-08-04; every approval is explicit, attributed and dated.
      </p>
    </main>
  )
}

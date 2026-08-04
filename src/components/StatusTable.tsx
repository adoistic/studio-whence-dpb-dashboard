'use client'

/**
 * The status table — the no-nonsense view: one row per comic, every deliverable
 * a column, a totals row at the bottom. Someone looks at it and knows exactly
 * where everything stands.
 *
 * The Diamond column is the only editable thing on the page, and only Approve /
 * Withdraw: every other state is derived from what has actually been delivered,
 * so nobody can mark a delivered script "not received" or hand-set "complete".
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Comic, Figure, Line, Program } from '@/types/content'
import { approve, unapprove, useApprovals, canApprove } from '@/lib/approvals'
import { buildStatusTable, statusTableCsvRows, statusTableTotals, type StatusTableRow } from '@/lib/statusTable'
import { formatMoney, type PricingConfig } from '@/lib/pricing'

const n = (v: number) => Math.round(v).toLocaleString('en-IN')

const TH =
  'sticky top-0 z-10 whitespace-nowrap border-b border-brand-pale-dusk bg-white px-3 py-2.5 text-left font-sans text-[0.6rem] font-normal uppercase tracking-label text-brand-slate'
const TD = 'whitespace-nowrap border-b border-brand-pale-dusk/50 px-3 py-2 align-middle font-sans text-[0.78rem] text-brand-indigo'

function Dot({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      title={`${label}: ${on ? 'done' : 'pending'}`}
      className={`inline-block h-2 w-2 rounded-full ${on ? 'bg-brand-indigo' : 'border border-brand-slate/50 bg-transparent'}`}
    />
  )
}

function DiamondCell({
  row, canAct, busy, onApprove, onWithdraw,
}: {
  row: StatusTableRow
  canAct: boolean
  busy: boolean
  onApprove: () => void
  onWithdraw: () => void
}) {
  if (row.approval) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="rounded-full bg-brand-gold/25 px-2 py-0.5 font-sans text-[0.66rem] font-semibold text-brand-indigo"
          title={`Approved by ${row.approval.by} on ${row.approval.at.slice(0, 10)}`}
        >
          Approved · {row.approval.at.slice(0, 10)}
        </span>
        {canAct ? (
          <button
            type="button"
            aria-label={`Withdraw approval for ${row.title}`}
            disabled={busy}
            onClick={onWithdraw}
            className="rounded-full px-1.5 font-sans text-[0.7rem] text-brand-slate hover:text-brand-indigo disabled:opacity-40"
            title="Withdraw this approval"
          >
            ×
          </button>
        ) : null}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-sans text-[0.7rem] text-brand-slate">{row.delivery.label}</span>
      {canAct ? (
        <button
          type="button"
          aria-label={`Approve ${row.title}`}
          disabled={busy}
          onClick={onApprove}
          className="rounded-full border border-brand-indigo px-2.5 py-0.5 font-sans text-[0.64rem] uppercase tracking-label text-brand-indigo transition hover:bg-brand-indigo hover:text-white disabled:opacity-40"
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
      if (onlyUnapproved && r.approval) return false
      if (!q) return true
      return (
        r.title.toLowerCase().includes(q) ||
        r.classification.toLowerCase().includes(q) ||
        r.subClassification.toLowerCase().includes(q)
      )
    })
  }, [allRows, scope, query, onlyUnapproved])

  const totals = useMemo(() => statusTableTotals(rows), [rows])

  async function act(key: string, fn: () => Promise<void>, okMsg: string) {
    setBusyKey(key)
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

  // Group separators: a heavier border whenever the classification changes.
  let prevClassification = ''

  return (
    <main className="mx-auto max-w-[1400px] px-6 pb-24 pt-10 md:pt-14">
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
            One row per comic, every deliverable a column. The Diamond column is the only thing
            anyone can set by hand — everything else reads straight off what has been delivered.
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
          Awaiting Diamond approval only
        </label>
        {note ? (
          <p role="status" className="mb-2 ml-auto font-sans text-[0.72rem] text-brand-indigo">{note}</p>
        ) : null}
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-brand-pale-dusk bg-white">
        <table className="w-full min-w-[1360px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>Classification</th>
              <th className={TH}>Sub-classification</th>
              <th className={TH}>Comic</th>
              <th className={`${TH} text-right`}>Pages</th>
              <th className={`${TH} text-right`} title="Cover 1 · IFC 1 · IBC 1 · back cover 1 · activity pages on actuals">
                + Covers &amp; activities
              </th>
              <th className={`${TH} text-right`}>Total</th>
              <th className={`${TH} text-right`}>Rate</th>
              <th className={`${TH} text-right`}>Total value</th>
              <th className={TH}>Script</th>
              <th className={TH}>Dossier</th>
              <th className={TH}>Illustration</th>
              <th className={TH} title="Cover · IFC/IBC · back cover · activity pages">Complete set</th>
              <th className={TH}>Marketing</th>
              <th className={TH}>Diamond</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const groupStart = r.classification !== prevClassification
              prevClassification = r.classification
              const b = r.breakdown
              const extrasTitle = [
                b.cover ? 'cover 1' : null,
                b.insideCovers ? `IFC/IBC ${b.insideCovers}` : null,
                b.backCover ? 'back cover 1' : null,
                b.activities ? `activity pages ${b.activities}` : null,
              ].filter(Boolean).join(' · ') || 'nothing beyond the interior yet'
              return (
                <tr key={r.key} className={`${groupStart ? 'border-t-2 border-t-brand-pale-dusk' : ''} hover:bg-brand-pale-dusk/20`}>
                  <td className={`${TD} ${groupStart ? '' : 'text-brand-slate/50'}`}>{r.classification}</td>
                  <td className={TD}>{r.subClassification}</td>
                  <td className={TD}>
                    <Link href={r.href} className="underline decoration-brand-gold/60 underline-offset-2 hover:decoration-brand-gold">
                      {r.title}
                    </Link>
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {n(r.interior)}
                    <span className="text-brand-slate/60"> / {r.target ? n(r.target) : '—'}</span>
                  </td>
                  <td className={`${TD} text-right tabular-nums`} title={extrasTitle}>
                    {b.extras > 0 ? `+${b.extras}` : '—'}
                  </td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>{n(r.totalPages)}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {formatMoney(r.rate, currency)}
                    {r.rateSource === 'comic' ? (
                      <span className="ml-1 rounded-sm bg-brand-gold/25 px-1 font-sans text-[0.54rem] uppercase tracking-label" title="Per-comic override">o</span>
                    ) : null}
                  </td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(r.totalValue, currency)}</td>
                  <td className={TD}>
                    <span title="A comic appears here only once its validated script is in">✓</span>
                    <span className="ml-1.5 text-brand-slate">{r.scriptDate || '—'}</span>
                  </td>
                  <td className={TD}>
                    <span className={r.dossier.state === 'none' ? 'text-brand-gold' : r.dossier.state === 'n/a' ? 'text-brand-slate/60' : ''}>
                      {r.dossier.state === 'n/a' ? '—' : r.dossier.label}
                    </span>
                  </td>
                  <td className={TD}>
                    {r.illustration.label}
                    {r.illustration.pct !== null && r.illustration.label === 'In progress' ? (
                      <span className="ml-1.5 text-brand-slate tabular-nums">{Math.round(r.illustration.pct * 100)}%</span>
                    ) : null}
                  </td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5">
                      <Dot on={r.set.cover} label="Cover" />
                      <Dot on={r.set.insideCovers} label="IFC/IBC" />
                      <Dot on={r.set.backCover} label="Back cover" />
                      <span
                        title={`Activity pages: ${r.set.activities}`}
                        className={`font-sans text-[0.68rem] tabular-nums ${r.set.activities ? 'text-brand-indigo' : 'text-brand-slate/50'}`}
                      >
                        {r.set.activities ? `Act ${r.set.activities}` : 'Act 0'}
                      </span>
                      {r.set.complete ? (
                        <span className="font-sans text-[0.62rem] font-semibold uppercase tracking-label text-brand-indigo">✓ set</span>
                      ) : null}
                    </span>
                  </td>
                  <td className={TD}>
                    <span className={r.marketing.label === '—' ? 'text-brand-slate/50' : ''}>{r.marketing.label}</span>
                  </td>
                  <td className={TD}>
                    <DiamondCell
                      row={r}
                      canAct={canAct}
                      busy={busyKey === r.key}
                      onApprove={() => void act(r.key, () => approve(r.key, email ?? ''), `${r.title} approved.`)}
                      onWithdraw={() => void act(r.key, () => unapprove(r.key), `Approval withdrawn for ${r.title}.`)}
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
              <td className={`${TD} text-right font-semibold tabular-nums`}>
                {n(totals.interior)}
                <span className="font-normal text-brand-slate/60"> / {n(totals.target)}</span>
              </td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>+{n(totals.extras)}</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{n(totals.totalPages)}</td>
              <td className={TD} />
              <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(totals.totalValue, currency)}</td>
              <td className={TD} colSpan={5} />
              <td className={`${TD} font-semibold`}>{n(totals.approved)} approved</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-brand-pale-dusk bg-white px-4 py-8 text-center font-sans text-[0.8rem] text-brand-slate">
          No comics match this view.
        </p>
      ) : null}

      <p className="mt-6 max-w-prose font-sans text-[0.72rem] leading-relaxed text-brand-slate">
        Counting: the three cover options count as <strong className="font-semibold text-brand-indigo">one</strong> cover
        page; IFC and IBC are one page each; the back cover is one; activity pages count on actuals.
        Total value = total pages × the rate (per comic override → line rate → studio default).
        The approval ledger was reset on 2026-08-04 — every approval shown is explicit, attributed and dated.
      </p>
    </main>
  )
}

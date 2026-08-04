'use client'

/**
 * The Accounts tab — the money story in one place (accounts team, 2026-08-04):
 *
 *   1. Advances received — what their group companies have already paid us,
 *      receipt by receipt, with the TDS they deducted at source.
 *   2. Invoices generated — how many invoices exist, their value, and what
 *      they pay after TDS.
 *   3. Work in progress — how many books are not yet invoiced, and what that
 *      pipeline is worth net of TDS.
 *
 * The strip on top answers the three questions at a glance and adds the one
 * derived number an accountant reaches for first: advances minus invoices —
 * how much of their money is still to be adjusted against future invoices.
 *
 * Same builder, same arithmetic as the status table — the tabs cannot
 * disagree. The advances ledger itself lives in ONE Firestore doc
 * (accounts/advances); recording a receipt is admin-side only.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Comic, Figure, Line, Program } from '@/types/content'
import { useApprovals } from '@/lib/approvals'
import { buildStatusTable, type StatusTableRow } from '@/lib/statusTable'
import { formatMoney, sumTaxes, type PricingConfig } from '@/lib/pricing'
import {
  advanceGross,
  advanceTds,
  advanceTotals,
  newAdvanceId,
  saveAdvances,
  useAdvances,
  type Advance,
} from '@/lib/advances'

const n = (v: number) => Math.round(v).toLocaleString('en-IN')

const TH =
  'whitespace-nowrap border-b border-brand-pale-dusk bg-white px-3 py-2.5 text-left font-sans text-[0.6rem] font-normal uppercase tracking-label text-brand-slate'
const TD =
  'whitespace-nowrap border-b border-brand-pale-dusk/50 px-3 py-2 align-middle font-sans text-[0.78rem] text-brand-indigo'
const FOOT = 'border-t-2 border-brand-pale-dusk bg-brand-pale-dusk/20'

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

function SectionHead({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="mt-10">
      <h2 className="font-serif text-[1.15rem] font-light text-brand-umber">{title}</h2>
      <p className="mt-1 font-sans text-[0.72rem] text-brand-slate">{caption}</p>
    </div>
  )
}

// ── Section 1: the advances ledger ───────────────────────────────────────────

function AdvancesSection({
  items, canAdmin, busy, onAdd, onRemove, currency,
}: {
  items: Advance[]
  canAdmin: boolean
  busy: boolean
  onAdd: (a: Advance) => void
  onRemove: (id: string) => void
  currency: string
}) {
  const [date, setDate] = useState('')
  const [company, setCompany] = useState('')
  const [amount, setAmount] = useState('')
  const [tds, setTds] = useState(false)
  const t = advanceTotals(items)
  const companies = Array.from(new Set(items.map((a) => a.company))).sort()

  const canSubmit = /^\d{4}-\d{2}-\d{2}$/.test(date) && company.trim() !== '' && Number(amount) > 0

  return (
    <>
      <SectionHead
        title="Advances received"
        caption="Every receipt as it arrived at the bank. Where the payer deducted 2% TDS at source, the gross advance and the TDS credit are worked out from the received amount."
      />
      <div className="mt-3 overflow-x-auto rounded-xl border border-brand-pale-dusk bg-white">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>Date</th>
              <th className={TH}>From</th>
              <th className={`${TH} text-right`}>Received (bank)</th>
              <th className={`${TH} text-right`}>TDS they deducted</th>
              <th className={`${TH} text-right`}>Gross advance</th>
              {canAdmin ? <th className={TH} /> : null}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className={`${TD} text-center text-brand-slate`} colSpan={canAdmin ? 6 : 5}>
                  No advances recorded yet.
                </td>
              </tr>
            ) : (
              items.map((a) => (
                <tr key={a.id} className="hover:bg-brand-pale-dusk/20">
                  <td className={`${TD} tabular-nums`}>{a.date}</td>
                  <td className={TD}>{a.company}</td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(a.amount, currency)}</td>
                  <td className={`${TD} text-right tabular-nums ${a.tdsDeducted ? '' : 'text-brand-slate/50'}`}>
                    {a.tdsDeducted ? formatMoney(advanceTds(a), currency) : 'None'}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{formatMoney(advanceGross(a), currency)}</td>
                  {canAdmin ? (
                    <td className={`${TD} text-right`}>
                      <button
                        type="button"
                        aria-label={`Remove advance of ${formatMoney(a.amount, currency)} from ${a.company} on ${a.date}`}
                        disabled={busy}
                        onClick={() => onRemove(a.id)}
                        title="Remove this receipt (mis-entry)"
                        className="rounded-full px-1.5 font-sans text-[0.72rem] text-brand-slate transition hover:text-brand-indigo disabled:opacity-40"
                      >
                        ×
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className={FOOT}>
              <td className={`${TD} font-semibold`} colSpan={2}>
                Total · {n(t.receipts)} {t.receipts === 1 ? 'receipt' : 'receipts'}
                {t.companies.length ? ` · ${t.companies.length} ${t.companies.length === 1 ? 'company' : 'companies'}` : ''}
              </td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(t.received, currency)}</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(t.tds, currency)}</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(t.gross, currency)}</td>
              {canAdmin ? <td className={TD} /> : null}
            </tr>
          </tfoot>
        </table>
      </div>

      {canAdmin ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-brand-pale-dusk bg-white px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!canSubmit) return
            onAdd({
              id: newAdvanceId(),
              date,
              company: company.trim(),
              amount: Number(amount),
              tdsDeducted: tds,
            })
            setDate('')
            setCompany('')
            setAmount('')
            setTds(false)
          }}
        >
          <span className="w-full font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
            Record a new advance
          </span>
          <label className="flex flex-col gap-1">
            <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">Date received</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date received"
              className="rounded-md border border-brand-pale-dusk bg-white px-3 py-2 font-sans text-[0.78rem] text-brand-indigo outline-none focus:border-brand-slate"
            />
          </label>
          <label className="flex min-w-[16rem] flex-col gap-1">
            <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">From (company)</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              list="advance-companies"
              placeholder="Diamond Magazines Private Limited"
              aria-label="Paying company"
              className="rounded-md border border-brand-pale-dusk bg-white px-3 py-2 font-sans text-[0.78rem] text-brand-indigo outline-none placeholder:text-brand-slate/50 focus:border-brand-slate"
            />
            <datalist id="advance-companies">
              {companies.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
              Amount received (₹)
            </span>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount received in rupees"
              className="w-40 rounded-md border border-brand-pale-dusk bg-white px-3 py-2 font-sans text-[0.78rem] text-brand-indigo outline-none focus:border-brand-slate"
            />
          </label>
          <label className="mb-2.5 flex items-center gap-2 font-sans text-[0.72rem] text-brand-slate">
            <input
              type="checkbox"
              checked={tds}
              onChange={(e) => setTds(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-indigo"
            />
            They deducted 2% TDS on it
          </label>
          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="mb-1 rounded-full border border-brand-indigo px-4 py-1.5 font-sans text-[0.66rem] uppercase tracking-label text-brand-indigo transition hover:bg-brand-indigo hover:text-white disabled:opacity-40"
          >
            Add receipt
          </button>
        </form>
      ) : null}
    </>
  )
}

// ── Sections 2 + 3: invoices and the pipeline ────────────────────────────────

function InvoicedSection({ rows, currency }: { rows: StatusTableRow[]; currency: string }) {
  const t = sumTaxes(rows)
  const pages = rows.reduce((s, r) => s + r.totalPages, 0)
  return (
    <>
      <SectionHead
        title="Invoices generated"
        caption="Books whose invoice has actually been raised (marked on the Approved-for-invoice tab)."
      />
      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-brand-pale-dusk bg-white px-4 py-6 text-center font-sans text-[0.78rem] text-brand-slate">
          No invoices generated yet — mark them on the Approved-for-invoice tab and they appear here.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-brand-pale-dusk bg-white">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Comic</th>
                <th className={TH}>Classification</th>
                <th className={TH}>Invoiced on</th>
                <th className={`${TH} text-right`}>Total pages</th>
                <th className={`${TH} text-right`}>Invoice value</th>
                <th className={`${TH} text-right`}>With GST</th>
                <th className={`${TH} text-right`}>Net of TDS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-brand-pale-dusk/20">
                  <td className={TD}>
                    <Link
                      href={r.href}
                      className="underline decoration-brand-gold/60 underline-offset-2 hover:decoration-brand-gold"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className={TD}>{r.classification}</td>
                  <td className={`${TD} tabular-nums`}>{r.invoice.generated?.at.slice(0, 10)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{n(r.totalPages)}</td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(r.totalValue, currency)}</td>
                  <td className={`${TD} text-right tabular-nums`} title={`GST 18% = ${formatMoney(r.gst, currency)}`}>
                    {formatMoney(r.totalWithGst, currency)}
                  </td>
                  <td className={`${TD} text-right tabular-nums`} title={`TDS 2% = ${formatMoney(r.tds, currency)}`}>
                    {formatMoney(r.netOfTds, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={FOOT}>
                <td className={`${TD} font-semibold`} colSpan={3}>
                  Total · {n(rows.length)} {rows.length === 1 ? 'invoice' : 'invoices'}
                </td>
                <td className={`${TD} text-right font-semibold tabular-nums`}>{n(pages)}</td>
                <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(t.totalValue, currency)}</td>
                <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(t.totalWithGst, currency)}</td>
                <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(t.netOfTds, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  )
}

function WipSection({ rows, currency }: { rows: StatusTableRow[]; currency: string }) {
  // Rolled up by classification: the accounts question is "how much pipeline",
  // not book-by-book detail — that lives on the Table tab.
  const groups = new Map<string, StatusTableRow[]>()
  for (const r of rows) groups.set(r.classification, [...(groups.get(r.classification) ?? []), r])
  const t = sumTaxes(rows)
  const pages = rows.reduce((s, r) => s + r.totalPages, 0)
  const generated = rows.reduce((s, r) => s + r.generatedPages, 0)
  return (
    <>
      <SectionHead
        title="Work in progress"
        caption="Every book not yet invoiced, rolled up by line. Their invoice value counts from the script (plus the standard extras), so this is what the pipeline will bill."
      />
      <div className="mt-3 overflow-x-auto rounded-xl border border-brand-pale-dusk bg-white">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>Classification</th>
              <th className={`${TH} text-right`}>Books</th>
              <th className={`${TH} text-right`}>Total pages</th>
              <th className={`${TH} text-right`}>Generated pages</th>
              <th className={`${TH} text-right`}>Invoice value</th>
              <th className={`${TH} text-right`}>Net of TDS</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(groups.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cls, rs]) => {
                const gt = sumTaxes(rs)
                return (
                  <tr key={cls} className="hover:bg-brand-pale-dusk/20">
                    <td className={TD}>{cls}</td>
                    <td className={`${TD} text-right tabular-nums`}>{n(rs.length)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{n(rs.reduce((s, r) => s + r.totalPages, 0))}</td>
                    <td className={`${TD} text-right tabular-nums text-brand-slate`}>
                      {n(rs.reduce((s, r) => s + r.generatedPages, 0))}
                    </td>
                    <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(gt.totalValue, currency)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{formatMoney(gt.netOfTds, currency)}</td>
                  </tr>
                )
              })}
          </tbody>
          <tfoot>
            <tr className={FOOT}>
              <td className={`${TD} font-semibold`}>Total work in progress</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{n(rows.length)}</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{n(pages)}</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{n(generated)}</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(t.totalValue, currency)}</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(t.netOfTds, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

// ── The tab ───────────────────────────────────────────────────────────────────

export function AccountsPanel({
  comics,
  figures,
  lines,
  programs,
  pricing,
  email,
  canAdmin,
  viewSwitcher,
}: {
  comics: Comic[]
  figures: Figure[] | null
  lines: Line[] | null
  programs: Program[] | null
  pricing: PricingConfig | null
  email: string | null
  canAdmin: boolean
  viewSwitcher?: React.ReactNode
}) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const approvals = useApprovals(refreshKey)
  const advances = useAdvances(refreshKey)
  const currency = pricing?.currency ?? 'INR'
  const items = advances.data ?? []

  const rows = useMemo(
    () =>
      buildStatusTable(
        comics, figures, lines, programs, pricing,
        approvals.data?.stages ?? null, approvals.data?.invoices ?? null,
      ),
    [comics, figures, lines, programs, pricing, approvals.data],
  )

  const invoiced = rows.filter((r) => r.invoice.generated)
  const wip = rows.filter((r) => !r.invoice.generated)
  const adv = advanceTotals(items)
  const invTotals = sumTaxes(invoiced)
  const wipTotals = sumTaxes(wip)
  const toAdjust = Math.round((adv.received - invTotals.netOfTds) * 100) / 100

  async function save(next: Advance[], okMsg: string) {
    setBusy(true)
    setNote(null)
    try {
      await saveAdvances(next, email ?? '')
      setRefreshKey((k) => k + 1)
      setNote(okMsg)
    } catch {
      setNote('Could not save — check that you are signed in with an admin account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-[1400px] px-6 pb-24 pt-10 md:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <span className="flex items-center gap-3">
            <span aria-hidden className="block h-px w-7 bg-brand-gold" />
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">Studio status</span>
          </span>
          <h1 className="mt-3 font-serif font-light leading-tight text-brand-umber text-[2rem] md:text-[2.6rem]">
            Accounts
          </h1>
          <p className="mt-2 max-w-2xl font-serif text-brand-umber/70 leading-relaxed">
            Money in, invoices out, and the pipeline in between: the advances their group companies
            have paid, the invoices we have raised, and the work in progress that will absorb the rest.
          </p>
        </div>
        <div className="flex items-center gap-2 pb-1">{viewSwitcher}</div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <Tile
          label="Advances received"
          value={formatMoney(adv.received, currency)}
          sub={`${n(adv.receipts)} receipts · ${adv.companies.length} ${adv.companies.length === 1 ? 'company' : 'companies'} · gross ${formatMoney(adv.gross, currency)} incl ${formatMoney(adv.tds, currency)} TDS`}
        />
        <Tile
          label="Invoices generated"
          value={n(invoiced.length)}
          sub={`invoice value ${formatMoney(invTotals.totalValue, currency)} · with GST ${formatMoney(invTotals.totalWithGst, currency)}`}
        />
        <Tile
          label="Invoices net of TDS"
          value={formatMoney(invTotals.netOfTds, currency)}
          sub="what the raised invoices pay after 2% TDS"
        />
        <Tile
          label={toAdjust >= 0 ? 'Advance left to adjust' : 'Invoiced beyond advances'}
          value={formatMoney(Math.abs(toAdjust), currency)}
          sub={
            toAdjust >= 0
              ? 'advances received minus invoices (net of TDS)'
              : 'invoices (net of TDS) exceed the advances received'
          }
        />
        <Tile
          label="Work in progress"
          value={n(wip.length)}
          sub={`books not yet invoiced · ${n(wip.reduce((s, r) => s + r.totalPages, 0))} billable pages`}
        />
        <Tile
          label="WIP net of TDS"
          value={formatMoney(wipTotals.netOfTds, currency)}
          sub="what the pipeline pays once invoiced"
        />
      </div>

      {note ? (
        <p role="status" className="mt-4 font-sans text-[0.72rem] text-brand-indigo">{note}</p>
      ) : null}

      <AdvancesSection
        items={items}
        canAdmin={canAdmin}
        busy={busy}
        currency={currency}
        onAdd={(a) => void save([...items, a], `Advance of ${formatMoney(a.amount, currency)} from ${a.company} recorded.`)}
        onRemove={(id) => {
          const gone = items.find((a) => a.id === id)
          void save(
            items.filter((a) => a.id !== id),
            gone ? `Advance of ${formatMoney(gone.amount, currency)} on ${gone.date} removed.` : 'Advance removed.',
          )
        }}
      />

      <InvoicedSection rows={invoiced} currency={currency} />
      <WipSection rows={wip} currency={currency} />

      <p className="mt-6 max-w-3xl font-sans text-[0.72rem] leading-relaxed text-brand-slate">
        Reading this page: <strong className="font-semibold text-brand-indigo">Advances received</strong> is cash at
        the bank; where the payer deducted TDS at source, the received amount is 98% of the gross, so the gross and
        the TDS credit are computed from it (rounded to the rupee).{' '}
        <strong className="font-semibold text-brand-indigo">Invoices generated</strong> are books marked invoiced on
        the Approved-for-invoice tab, valued exactly as on the table (pages × rate, GST 18%, TDS 2% of the base).{' '}
        <strong className="font-semibold text-brand-indigo">Work in progress</strong> is every other book — its
        invoice value counts from the script plus the standard extras, per the billing rule.
      </p>
    </main>
  )
}

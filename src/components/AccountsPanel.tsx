'use client'

/**
 * The Accounts tab — the money story in one place (accounts team, 2026-08-04):
 *
 * On top, THE STATEMENT — a reconciliation an accountant can read line by
 * line, each line a count and a net-of-TDS value:
 *
 *   Advances received        5 receipts      ₹2,18,294   (cash at the bank)
 *   Invoices generated       N books         ₹…          (raised against them)
 *   Advance still to adjust                  ₹…          (the difference)
 *   Work in progress         M books         ₹…          (invoiced after the
 *                                                         work completes and
 *                                                         the client approves)
 *
 * Every book is in exactly ONE of the two book lines — invoiced or in
 * progress — so the counts visibly add up to the whole catalog, and a book
 * already approved for invoice but not yet generated is called out inside
 * WIP (it is still "invoice not generated", but it is no longer waiting on
 * approval). Below the statement sit the three detail sections: the advances
 * ledger, the invoices, and the WIP rollup by line.
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

// ── The statement ─────────────────────────────────────────────────────────────

const books = (k: number) => `${n(k)} ${k === 1 ? 'book' : 'books'}`

function StatementRow({
  label, sub, count, value, derived, indent,
}: {
  label: string
  sub?: string
  count?: string
  value: string
  /** The computed balance line — set apart so it reads as arithmetic, not data. */
  derived?: boolean
  /** An "of which" line inside the row above it. */
  indent?: boolean
}) {
  const base = derived ? 'bg-brand-gold/10' : indent ? 'bg-white' : 'bg-white'
  return (
    <tr className={base}>
      <td className={`${TD} ${indent ? 'pl-10' : ''} whitespace-normal`}>
        <span className={`${derived ? 'font-semibold' : ''} ${indent ? 'text-[0.72rem] text-brand-slate' : ''}`}>
          {label}
        </span>
        {sub ? <span className="ml-2 font-sans text-[0.68rem] text-brand-slate">{sub}</span> : null}
      </td>
      <td className={`${TD} text-right tabular-nums ${indent ? 'text-[0.72rem] text-brand-slate' : ''}`}>
        {count ?? ''}
      </td>
      <td
        className={`${TD} text-right tabular-nums ${derived ? 'font-semibold' : indent ? 'text-[0.72rem] text-brand-slate' : 'font-semibold'}`}
      >
        {value}
      </td>
    </tr>
  )
}

/**
 * The reconciliation the accounts team asked to see in one place: the advance,
 * the invoices raised against it, the balance, and the pipeline that will be
 * invoiced once work completes and the client approves. One count column, one
 * net-of-TDS value column, and the two book lines partition the catalog.
 */
function Statement({
  advTotals, invoiced, wip, allCount, currency,
}: {
  advTotals: ReturnType<typeof advanceTotals>
  invoiced: StatusTableRow[]
  wip: StatusTableRow[]
  allCount: number
  currency: string
}) {
  const invNet = sumTaxes(invoiced).netOfTds
  const wipNet = sumTaxes(wip).netOfTds
  const pending = wip.filter((r) => r.invoice.approved)
  const pendingNet = sumTaxes(pending).netOfTds
  const toAdjust = Math.round((advTotals.received - invNet) * 100) / 100

  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-brand-pale-dusk bg-white">
      <table className="w-full min-w-[700px] border-collapse">
        <thead>
          <tr>
            <th className={TH}>The position</th>
            <th className={`${TH} text-right`}>Count</th>
            <th className={`${TH} text-right`}>Value (net of TDS)</th>
          </tr>
        </thead>
        <tbody>
          <StatementRow
            label="Advances received"
            sub="cash from the group companies, after their TDS deductions"
            count={`${n(advTotals.receipts)} ${advTotals.receipts === 1 ? 'receipt' : 'receipts'}`}
            value={formatMoney(advTotals.received, currency)}
          />
          <StatementRow
            label="Invoices generated"
            sub="raised against those advances"
            count={books(invoiced.length)}
            value={formatMoney(sumTaxes(invoiced).netOfTds, currency)}
          />
          <StatementRow
            label={toAdjust >= 0 ? 'Advance still to adjust' : 'Invoices exceed the advances'}
            sub={toAdjust >= 0 ? '= advances − invoices' : '= invoices − advances'}
            value={formatMoney(Math.abs(toAdjust), currency)}
            derived
          />
          <StatementRow
            label="Work in progress"
            sub="invoiced once the work completes and the client approves it"
            count={books(wip.length)}
            value={formatMoney(wipNet, currency)}
          />
          {pending.length > 0 ? (
            <StatementRow
              label="…of which already approved for invoice, awaiting generation"
              count={books(pending.length)}
              value={formatMoney(pendingNet, currency)}
              indent
            />
          ) : null}
        </tbody>
      </table>
      <p className="border-t border-brand-pale-dusk/60 px-3 py-2 font-sans text-[0.66rem] text-brand-slate">
        Every book is on exactly one line: {books(invoiced.length)} invoiced + {books(wip.length)} in
        progress = {books(allCount)} in the catalog. Values are net of TDS — what the invoice pays after
        the client deducts 2% of the base.
      </p>
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
        caption="Every receipt as it arrived at the bank. Where the payer deducted TDS at source, the TDS is 2% of the base recovered from the receipt (received ÷ 1.16), and the gross is the receipt plus that TDS."
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

      <Statement advTotals={adv} invoiced={invoiced} wip={wip} allCount={rows.length} currency={currency} />

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
        the bank. Where the payer deducted TDS at source, the receipt is the GST-inclusive value net of TDS — ₹116
        for every ₹100 of base — so the TDS credit is 2% of received ÷ 1.16, and the gross is the receipt plus that
        TDS (figures rounded to the rupee on screen).{' '}
        <strong className="font-semibold text-brand-indigo">Invoices generated</strong> are books marked invoiced on
        the Approved-for-invoice tab, valued exactly as on the table (pages × rate, GST 18%, TDS 2% of the base).{' '}
        <strong className="font-semibold text-brand-indigo">Work in progress</strong> is every other book — its
        invoice value counts from the script plus the standard extras, per the billing rule.
      </p>
    </main>
  )
}

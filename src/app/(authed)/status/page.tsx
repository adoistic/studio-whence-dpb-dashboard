'use client'

import { useState } from 'react'
import { useLines, useAllPrograms } from '@/lib/catalog'
import { useVisibleComics, useVisibleFigures } from '@/lib/visibleCatalog'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { usePricing } from '@/lib/pricing'
import { ProductionDashboard } from '@/components/ProductionDashboard'
import { StatusTable } from '@/components/StatusTable'
import { InvoiceTable } from '@/components/InvoiceTable'
import { AccountsPanel } from '@/components/AccountsPanel'
import { LoadingState, ErrorState } from '@/components/QuietStates'

/**
 * /status — the production status page, four renderings of the same data:
 *
 *   Table (default) — one row per comic with the financial summary strip on
 *   top, every deliverable a column, plus the Diamond approval ledger and the
 *   invoice trail. Self-sufficient: the bird's-eye view lives here too.
 *
 *   Approved for invoice — only books explicitly approved for invoicing;
 *   the place where a raised invoice is marked generated.
 *
 *   Accounts — advances received from the group companies, invoices raised,
 *   and the un-invoiced pipeline (work in progress), reconciled in one place.
 *
 *   Overview — the rolled-up drill-down (headline → line → series → comic).
 *
 * Access follows the rest of the site: the route sits inside (authed) and
 * `useVisibleComics` narrows the catalog to what this person may see, so a
 * member gets a real table of exactly their allocated comics.
 */
export default function StatusPage() {
  const { user, loading: authLoading } = useUser()
  const status = useAllowStatus(user, authLoading)
  const canMod = canModerate(status)
  const email = user?.email ?? null

  const [view, setView] = useState<'table' | 'invoices' | 'accounts' | 'overview'>('table')

  const { data: comics, loading: comicsLoading, error } = useVisibleComics(canMod, email)
  const { data: figures } = useVisibleFigures(canMod, email)
  const { data: lines } = useLines()
  const { data: programs } = useAllPrograms()
  const { data: pricing, loading: pricingLoading } = usePricing()

  if (authLoading || comicsLoading || pricingLoading) return <LoadingState />
  if (error) return <ErrorState />

  const switcher = (
    <div role="tablist" aria-label="View" className="flex rounded-full border border-brand-pale-dusk bg-white p-0.5">
      {(
        [
          ['table', 'Table'],
          ['invoices', 'Approved for invoice'],
          ['accounts', 'Accounts'],
          ['overview', 'Overview'],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={view === key}
          onClick={() => setView(key)}
          className={`rounded-full px-3.5 py-1 font-sans text-[0.7rem] transition ${
            view === key ? 'bg-brand-indigo text-white' : 'text-brand-slate hover:text-brand-indigo'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return view === 'table' ? (
    <StatusTable
      comics={comics ?? []}
      figures={figures}
      lines={lines}
      programs={programs}
      pricing={pricing}
      email={email}
      canModerate={canMod}
      canAdmin={canMod}
      viewer={status === 'viewer'}
      viewSwitcher={switcher}
    />
  ) : view === 'invoices' ? (
    <InvoiceTable
      comics={comics ?? []}
      figures={figures}
      lines={lines}
      programs={programs}
      pricing={pricing}
      email={email}
      canModerate={canMod}
      viewer={status === 'viewer'}
      viewSwitcher={switcher}
    />
  ) : view === 'accounts' ? (
    <AccountsPanel
      comics={comics ?? []}
      figures={figures}
      lines={lines}
      programs={programs}
      pricing={pricing}
      email={email}
      canAdmin={canMod}
      viewSwitcher={switcher}
    />
  ) : (
    <ProductionDashboard
      comics={comics ?? []}
      lines={lines}
      programs={programs}
      pricing={pricing}
      canAdmin={canMod}
      viewSwitcher={switcher}
    />
  )
}

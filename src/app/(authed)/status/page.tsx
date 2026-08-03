'use client'

import { useLines, useAllPrograms } from '@/lib/catalog'
import { useVisibleComics } from '@/lib/visibleCatalog'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { usePricing } from '@/lib/pricing'
import { ProductionDashboard } from '@/components/ProductionDashboard'
import { LoadingState, ErrorState } from '@/components/QuietStates'

/**
 * /status — the production dashboard.
 *
 * Access follows the same rule as everything else on the site: the route sits
 * inside (authed), so an unauthenticated or unapproved visitor never reaches it,
 * and `useVisibleComics` narrows the catalog to what this particular person is
 * allowed to see. A member with two allocated comics gets a real dashboard of
 * those two — the headline is scoped to them rather than blanked out, because a
 * total they cannot reconcile against the rows below is worse than a small one.
 */
export default function StatusPage() {
  const { user, loading: authLoading } = useUser()
  const status = useAllowStatus(user, authLoading)
  const canMod = canModerate(status)
  const email = user?.email ?? null

  const { data: comics, loading: comicsLoading, error } = useVisibleComics(canMod, email)
  const { data: lines } = useLines()
  const { data: programs } = useAllPrograms()
  const { data: pricing, loading: pricingLoading } = usePricing()

  if (authLoading || comicsLoading || pricingLoading) return <LoadingState />
  if (error) return <ErrorState />

  return (
    <ProductionDashboard
      comics={comics ?? []}
      lines={lines}
      programs={programs}
      pricing={pricing}
      canAdmin={canMod}
    />
  )
}

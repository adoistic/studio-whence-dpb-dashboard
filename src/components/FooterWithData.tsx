'use client'

/**
 * FooterWithData — a thin client wrapper that reads build/data provenance from
 * the Firestore catalog (catalog meta) and feeds it to the presentational <Footer>.
 *
 * Footer guards on `sha`/`lastUpdate` being present, so while the catalog meta is
 * still loading (meta === null) it simply renders a footer without the build/date
 * lines — which is the correct degrade-during-load behaviour.
 */

import { useHeadline } from '@/lib/catalog'
import { Footer } from '@/components/Footer'

export function FooterWithData() {
  const { data: meta } = useHeadline()
  return <Footer sha={meta?.source_sha} lastUpdate={meta?.generated_at} />
}

'use client'

/**
 * FooterWithData — a thin client wrapper that reads build/data provenance from
 * the gated content channel and feeds it to the presentational <Footer>.
 *
 * Footer guards on `sha`/`lastUpdate` being present, so while content is still
 * loading (content === null) it simply renders a footer without the build/date
 * lines — which is the correct degrade-during-load behaviour.
 */

import { useContent } from '@/lib/content'
import { Footer } from '@/components/Footer'

export function FooterWithData() {
  const { content } = useContent()
  return <Footer sha={content?.source_sha} lastUpdate={content?.generated_at} />
}

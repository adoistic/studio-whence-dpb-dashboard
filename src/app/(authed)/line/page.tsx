'use client'

import { useContent } from '@/lib/content'
import { LinePageShell } from '@/components/LinePageShell'
import { LoadingState, ErrorState, NotFoundState } from '@/components/QuietStates'
import { INTROS } from '@/lib/intros'

// Read the first path segment of the browser URL as the line slug. This single
// page is served for every /<line> URL via the Firebase Hosting rewrite
// (/* → /line.html, added in Task 2.7); the browser URL is preserved, so
// window.location.pathname gives the real line slug. SSR/no-window is guarded.
// NOTE: /line itself is a reserved path — slug "line" is never a real line, so it
// resolves to the not-found state, which is harmless.
function lineSlugFromPath(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname.replace(/^\/+/, '').split('/')[0] ?? ''
}

export default function LinePage() {
  const { content, loading, error } = useContent()
  const slug = lineSlugFromPath()

  if (loading) return <LoadingState />
  if (error || !content) return <ErrorState />

  const line = content.lines.find((l) => l.slug === slug)
  if (!line) return <NotFoundState title="Line not found" detail={`No line matches “${slug}”.`} />

  // INTROS[slug] is typed non-undefined (tsconfig has no noUncheckedIndexedAccess),
  // but at runtime an unknown slug yields undefined — the guard is load-bearing.
  const Intro = INTROS[slug]
  return <LinePageShell line={line} introMdx={Intro ? <Intro /> : null} />
}

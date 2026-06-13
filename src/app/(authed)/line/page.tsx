'use client'

import type { Line } from '@/types/content'
import { useLines, usePeople } from '@/lib/catalog'
import { useVisibleComics, useVisibleFigures } from '@/lib/visibleCatalog'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { personDocToRow } from '@/lib/people'
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
  const { data: lines, loading, error } = useLines()
  const slug = lineSlugFromPath()

  // Members get the gated catalog; moderators get the full scan. We filter the
  // visible comics down to this line (the page can't issue a member-safe
  // line-scoped scan — see visibleCatalog).
  const { user, loading: authLoading } = useUser()
  const status = useAllowStatus(user, authLoading)
  const canMod = canModerate(status)
  const email = user?.email ?? null
  const { data: allComics } = useVisibleComics(canMod, email)
  const comics = (allComics ?? []).filter((c) => c.line === slug)
  // Figures + people are no longer biographies-only: any line that has them
  // (e.g. medicomics, where each disease is a figure) gets a People-style table.
  // The figure scan is global (or allocation-scoped for members), so narrow it to
  // this line via the runtime `line` field figure docs carry. usePeople(slug) is
  // already line-scoped. Members see only their allocated set; moderators see all.
  const { data: allFigures } = useVisibleFigures(canMod, email)
  const figures = (allFigures ?? []).filter((f) => (f as { line?: string }).line === slug)
  const { data: people } = usePeople(slug)

  if (loading) return <LoadingState />
  if (error || !lines) return <ErrorState />

  const lineDoc = lines.find((l) => l.slug === slug)
  if (!lineDoc) return <NotFoundState title="Line not found" detail={`No line matches “${slug}”.`} />

  const line: Line = { ...lineDoc, comics, figures }
  const peopleRows = people ? people.map(personDocToRow) : undefined

  // INTROS[slug] is typed non-undefined (tsconfig has no noUncheckedIndexedAccess),
  // but at runtime an unknown slug yields undefined — the guard is load-bearing.
  const Intro = INTROS[slug]
  return <LinePageShell line={line} introMdx={Intro ? <Intro /> : null} people={peopleRows} />
}

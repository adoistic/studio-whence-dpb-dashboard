'use client'

import { useProgram } from '@/lib/catalog'
import { useVisibleComics, useVisibleFigures } from '@/lib/visibleCatalog'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { ProgramPageShell } from '@/components/ProgramPageShell'
import { LoadingState, ErrorState, NotFoundState } from '@/components/QuietStates'

// Served for every /programs/<line>/<slug> URL via the Firebase Hosting rewrite
// (/programs/*/* → /program.html). The pretty URL is preserved, so the pathname
// gives the real line + program slug. A program prefix (like /figures/) keeps it
// from colliding with the two-segment comic route (/<line>/<comic>).
function programFromPath(): { line: string; slug: string } {
  if (typeof window === 'undefined') return { line: '', slug: '' }
  const parts = window.location.pathname.replace(/^\/+/, '').split('/')
  return { line: parts[1] ?? '', slug: parts[2] ?? '' }
}

export default function ProgramPage() {
  const { line: lineSlug, slug } = programFromPath()
  const { data: program, loading, error } = useProgram(lineSlug, slug)

  // The program's comics + characters come from the gated visible-catalog hooks
  // (admin = full scan, member = allocation-scoped), filtered to this program —
  // so gating is exactly the same as everywhere else, never a raw query.
  const { user, loading: authLoading } = useUser()
  const status = useAllowStatus(user, authLoading)
  const canMod = canModerate(status)
  const email = user?.email ?? null
  const { data: allComics } = useVisibleComics(canMod, email)
  const { data: allFigures } = useVisibleFigures(canMod, email)
  const comics = (allComics ?? []).filter((c) => c.program_slug === slug && c.line === lineSlug)
  const figures = (allFigures ?? []).filter((f) => f.program_slug === slug && f.line === lineSlug)

  if (loading) return <LoadingState />
  if (error) return <ErrorState />
  if (!program) return <NotFoundState title="Program not found" detail={`No program matches “${slug}”.`} />

  return <ProgramPageShell program={program} comics={comics} figures={figures} />
}

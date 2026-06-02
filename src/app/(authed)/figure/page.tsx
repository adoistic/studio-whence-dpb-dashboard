'use client'

import { useContent } from '@/lib/content'
import { FigurePageShell } from '@/components/FigurePageShell'
import { LoadingState, ErrorState, NotFoundState } from '@/components/QuietStates'
import { normalizeSubjectSlug } from '@/lib/slugs'

// Served for every /figures/<slug> URL via the Hosting rewrite (/figures/* →
// /figure.html); the browser URL is preserved, so window.location gives the real
// slug. The first segment is the literal "figures"; the figure slug is segment 2.
function figureSlugFromPath(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname.replace(/^\/+/, '').split('/')[1] ?? ''
}

export default function FigurePage() {
  const { content, loading, error } = useContent()
  const slug = normalizeSubjectSlug(figureSlugFromPath())

  if (loading) return <LoadingState />
  if (error || !content) return <ErrorState />

  const figure = content.lines.flatMap((l) => l.figures).find((f) => normalizeSubjectSlug(f.slug) === slug)
  if (!figure) return <NotFoundState title="Figure not found" detail={`No figure matches “${slug}”.`} />

  return <FigurePageShell figure={figure} />
}

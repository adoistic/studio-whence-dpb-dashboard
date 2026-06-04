'use client'

import { useFigure } from '@/lib/catalog'
import { FigurePageShell } from '@/components/FigurePageShell'
import { LoadingState, NotFoundState } from '@/components/QuietStates'
import { normalizeSubjectSlug } from '@/lib/slugs'

// Served for every /figures/<slug> URL via the Hosting rewrite (/figures/* →
// /figure.html); the browser URL is preserved, so window.location gives the real
// slug. The first segment is the literal "figures"; the figure slug is segment 2.
function figureSlugFromPath(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname.replace(/^\/+/, '').split('/')[1] ?? ''
}

// Provenance deep-link params: ?file=<source path>&line=<n>. Returns the raw
// values; the file is validated against the figure's sources by the caller.
function paramsFromUrl(): { file: string | null; line: number | undefined } {
  if (typeof window === 'undefined') return { file: null, line: undefined }
  const sp = new URLSearchParams(window.location.search)
  const file = sp.get('file')
  const lineStr = sp.get('line')
  const line = lineStr && /^\d+$/.test(lineStr) ? Number(lineStr) : undefined
  return { file, line }
}

export default function FigurePage() {
  const slug = normalizeSubjectSlug(figureSlugFromPath())
  const { data, loading, error } = useFigure(slug)

  if (loading) return <LoadingState />
  // Under the allocation rules, reading a figure the member isn't allocated
  // throws permission-denied, so useFigure sets `error`. Surface that (and a
  // genuinely missing doc) as the same clean not-found, so we never leak whether
  // an un-allocated figure exists.
  if (error || !data) return <NotFoundState title="Figure not found" detail={`No figure matches “${slug}”.`} />

  const figure = data.figure
  const { file, line } = paramsFromUrl()
  const valid = !!file && (figure.sources ?? []).some((s) => s.files.some((f) => f.path === file))
  return <FigurePageShell figure={figure} initialFile={valid ? file : null} targetLine={valid ? line : undefined} />
}

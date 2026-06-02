'use client'

import { useContent } from '@/lib/content'
import { ComicPageShell } from '@/components/ComicPageShell'
import { LoadingState, ErrorState, NotFoundState } from '@/components/QuietStates'

// Read the first two path segments of the browser URL as <line>/<comic-slug>.
// This single page is served for every /<line>/<comic> URL via the Firebase
// Hosting rewrite (/*/* → /comic.html); the browser URL is preserved, so
// window.location.pathname gives the real segments. SSR/no-window is guarded.
// NOTE: /comic itself has only one usable segment → resolves to not-found, harmless.
function segmentsFromPath(): { lineSlug: string; comicSlug: string } {
  if (typeof window === 'undefined') return { lineSlug: '', comicSlug: '' }
  const parts = window.location.pathname.replace(/^\/+/, '').split('/')
  return { lineSlug: parts[0] ?? '', comicSlug: parts[1] ?? '' }
}

export default function ComicPage() {
  const { content, loading, error } = useContent()
  const { lineSlug, comicSlug } = segmentsFromPath()

  if (loading) return <LoadingState />
  if (error || !content) return <ErrorState />

  const line = content.lines.find((l) => l.slug === lineSlug)
  const comic = line?.comics.find((c) => c.slug === comicSlug)
  if (!comic) return <NotFoundState title="Comic not found" detail={`No comic matches “${lineSlug}/${comicSlug}”.`} />

  return <ComicPageShell comic={comic} />
}

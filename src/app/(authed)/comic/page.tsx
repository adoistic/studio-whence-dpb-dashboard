'use client'

import { useComic } from '@/lib/catalog'
import { ComicPageShell } from '@/components/ComicPageShell'
import { BookPageShell } from '@/components/books/BookPageShell'
import { isBook } from '@/lib/books'
import { LoadingState, NotFoundState } from '@/components/QuietStates'

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
  const { lineSlug, comicSlug } = segmentsFromPath()
  const { data: comic, loading, error } = useComic(lineSlug, comicSlug)

  if (loading) return <LoadingState />
  // useComic sets `error` ("comic not found") on a missing doc; treat any
  // failure as not-found to preserve the not-found UX for a bad /<line>/<slug>.
  if (error || !comic)
    return <NotFoundState title="Comic not found" detail={`No comic matches “${lineSlug}/${comicSlug}”.`} />

  // A prose book is a comic doc with format 'prose'; it reads as a document, not
  // a page gallery, so it gets its own shell. Branching here, before either
  // shell mounts, keeps ComicPageShell's unconditional hooks untouched.
  if (isBook(comic)) return <BookPageShell comic={comic} />
  return <ComicPageShell comic={comic} />
}

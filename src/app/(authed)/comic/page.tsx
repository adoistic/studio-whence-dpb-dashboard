'use client'

import { useEffect, useState } from 'react'
import { useContent } from '@/lib/content'
import { ComicPageShell } from '@/components/ComicPageShell'

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
  if (!comic) return <NotFoundState lineSlug={lineSlug} comicSlug={comicSlug} />

  return <ComicPageShell comic={comic} />
}

// ── Quiet states (same idiom as the /line page) ──────────────────────────────

function LoadingState() {
  return (
    <div role="status" className="flex min-h-[40vh] items-center justify-center">
      <p className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">Loading…</p>
    </div>
  )
}

// Copied VERBATIM from the shipped /line page's ErrorState: the role="alert"
// region is filled AFTER mount via the effect, because a live region that mounts
// already-populated announces unreliably across some screen-reader/browser pairs.
function ErrorState() {
  const [announce, setAnnounce] = useState('')
  useEffect(() => {
    setAnnounce('Couldn’t load. Please reload the page.')
  }, [])
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
      <p className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">Couldn’t load</p>
      <p className="max-w-xs font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/55">
        Please reload the page.
      </p>
      <div role="alert" className="sr-only">{announce}</div>
    </div>
  )
}

function NotFoundState({ lineSlug, comicSlug }: { lineSlug: string; comicSlug: string }) {
  return (
    <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
      <p className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">Comic not found</p>
      <p className="max-w-xs font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/55">
        No comic matches “{lineSlug}/{comicSlug}”.
      </p>
    </div>
  )
}

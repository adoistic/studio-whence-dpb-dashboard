'use client'

import { useEffect, useState } from 'react'
import { readMedikidzSite } from '@/lib/dataApi'

/**
 * ComicAnalysisTab — the gated Medikidz "Comic Analysis" embed.
 *
 * Fetches the self-contained analysis page from the gated dataApi Function
 * (`GET /medikidz-site`, token-bearing). The Function rewrites every image path
 * to a presigned R2 URL before returning, so the HTML renders as-is.
 *
 * The page is rendered in a sandboxed iframe via `srcDoc`. `allow-scripts` is
 * REQUIRED because ~192 of 195 images are injected by the page's own inline
 * <script> (a `const BOOKS=[…]` array rendered via innerHTML). The presigned
 * cross-origin <img> URLs need no CORS to render. The content is otherwise
 * untrusted, so the sandbox limits it to scripts + same-origin (for its own
 * relative anchors); no `allow-top-navigation` / `allow-forms` / `allow-popups`.
 */
export function ComicAnalysisTab() {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    readMedikidzSite()
      .then((text) => {
        if (active) setHtml(text)
      })
      .catch(() => {
        if (active) setError('Could not load the comic analysis.')
      })
    return () => {
      active = false
    }
  }, [])

  if (error) {
    return <p className="font-sans text-[0.75rem] text-red-700">{error}</p>
  }
  if (html === null) {
    return (
      <p className="font-sans text-[0.75rem] text-brand-slate">
        Loading the comic analysis…
      </p>
    )
  }
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-scripts allow-same-origin"
      title="Medikidz Comic Analysis"
      className="h-[80vh] w-full rounded-lg border border-brand-pale-dusk bg-white"
    />
  )
}

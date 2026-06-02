'use client'

import { useEffect, useState } from 'react'
import { readMarkdown } from '@/lib/dataApi'

export interface DraftHtmlState {
  html: string | null
  loading: boolean
  error?: Error
}

/**
 * Fetch a rendered draft's sanitized HTML from the gated /read channel.
 *
 * `key` is the R2 key (e.g. `drafts/<line>/<slug>.html`), or null when there is
 * nothing to fetch yet (the comic is unresolved). A null/empty key short-circuits
 * to an idle state with NO request.
 *
 * The bytes at `drafts/**` are produced solely by the content pipeline's
 * render_draft_html (markdown → bleach.clean strict allow-list) and are therefore
 * XSS-clean — the caller may inject them. readMarkdown throws on a non-ok response
 * (including 404 for a comic with no published draft); that lands in `error` so the
 * caller can render a graceful "draft not available" note rather than crash.
 */
export function useDraftHtml(key: string | null): DraftHtmlState {
  const [state, setState] = useState<DraftHtmlState>({
    html: null,
    loading: Boolean(key),
  })

  useEffect(() => {
    if (!key) {
      setState({ html: null, loading: false })
      return
    }
    let active = true
    setState({ html: null, loading: true })
    readMarkdown(key)
      .then((html) => {
        if (active) setState({ html, loading: false })
      })
      .catch((err) => {
        if (active)
          setState({
            html: null,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          })
      })
    return () => {
      active = false
    }
  }, [key])

  return state
}

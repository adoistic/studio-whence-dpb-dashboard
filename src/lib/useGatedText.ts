'use client'

import { useEffect, useState } from 'react'
import { readMarkdown } from '@/lib/dataApi'

export interface GatedTextState {
  text: string | null
  loading: boolean
  error?: Error
}

/**
 * Fetch a gated text resource from the /read channel as a string.
 *
 * `key` is the R2 key (e.g. `drafts/<line>/<slug>.html` or `research/<path>`), or
 * null when there is nothing to fetch (short-circuits to idle, NO request).
 * readMarkdown throws on a non-ok response (incl. 404); that lands in `error` so
 * the caller can render a graceful "not available" note rather than crash.
 *
 * The returned text is opaque transport: a comic draft is pre-sanitized HTML
 * (the caller injects it); a research file is markdown (the caller renders it via
 * react-markdown). This hook does no parsing.
 */
export function useGatedText(key: string | null): GatedTextState {
  const [state, setState] = useState<GatedTextState>({
    text: null,
    loading: Boolean(key),
  })

  useEffect(() => {
    if (!key) {
      setState({ text: null, loading: false })
      return
    }
    let active = true
    setState({ text: null, loading: true })
    readMarkdown(key)
      .then((text) => {
        if (active) setState({ text, loading: false })
      })
      .catch((err) => {
        if (active)
          setState({
            text: null,
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

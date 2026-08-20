'use client'

import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'

/**
 * Client for the gated search Worker. Same bearer-token pattern as dataApi.ts,
 * pointed at the Cloudflare Worker instead of the Cloud Function.
 *
 * The Worker filters every result by the caller's allocation before replying,
 * so nothing here needs to re-check access — and nothing here COULD, since the
 * client never sees the index.
 */
export interface SearchHit {
  comicId: string
  line: string
  slug: string
  title: string
  lang: string
  page: number
  snippet: string
  refs: string[]
}

export interface SearchResult {
  total: number
  hits: SearchHit[]
}

const EMPTY: SearchResult = { total: 0, hits: [] }

export const PAGE_SIZE = 50

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_SEARCH_API_URL ?? '').replace(/\/+$/, '')
}

export async function runSearch(
  q: string, opts: { limit?: number; offset?: number } = {},
): Promise<SearchResult> {
  const query = q.trim()
  if (!query) return EMPTY

  const params = new URLSearchParams({ q: query })
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))

  const token = (await auth.currentUser?.getIdToken()) ?? null
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${baseUrl()}/search?${params}`, { headers })
  if (!res.ok) throw new Error(`search failed: ${res.status}`)
  return (await res.json()) as SearchResult
}

/**
 * Debounced search with a "load more" that APPENDS.
 *
 * `total` is the full match count from the Worker, which ranks everything
 * before slicing — so the count is honest about how much there is, not just how
 * much has been fetched. An empty query resets to idle with no request.
 */
export function usePagedSearch(q: string): {
  data: SearchResult | null
  loading: boolean
  loadingMore: boolean
  error?: Error
  loadMore: () => void
  hasMore: boolean
} {
  const [data, setData] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)

  useEffect(() => {
    if (!q.trim()) {
      setData(null); setLoading(false); setError(undefined)
      return
    }
    let active = true
    setLoading(true); setError(undefined); setData(null)
    const timer = setTimeout(() => {
      runSearch(q, { limit: PAGE_SIZE, offset: 0 })
        .then((r) => { if (active) { setData(r); setLoading(false) } })
        .catch((err) => {
          if (!active) return
          setError(err instanceof Error ? err : new Error(String(err)))
          setLoading(false)
        })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [q])

  const hasMore = !!data && data.hits.length < data.total

  function loadMore() {
    if (!data || loadingMore || !hasMore) return
    setLoadingMore(true)
    runSearch(q, { limit: PAGE_SIZE, offset: data.hits.length })
      .then((next) => {
        setData((prev) => (prev ? { total: next.total, hits: [...prev.hits, ...next.hits] } : next))
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setLoadingMore(false))
  }

  return { data, loading, loadingMore, error, loadMore, hasMore }
}

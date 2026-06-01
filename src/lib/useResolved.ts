'use client'

/**
 * useResolved — batch-resolve R2 keys to presigned URLs for rendering images.
 *
 * Given a list of R2 keys (e.g. `['images/...']`), it returns a map from key →
 * presigned URL for the keys that have resolved. A key not yet resolved is
 * simply absent from the map; callers should guard their `<img>` on presence.
 *
 * Resolution goes through `resolveUrls` (the gated /resolve route) and is
 * memoized in a MODULE-LEVEL cache shared across every hook instance, so a key
 * resolved once is reused everywhere without a second network call.
 *
 * Note: presigned URLs have a ~10min TTL; this Phase-A cache has no expiry, so
 * a page reload re-resolves. That is acceptable per spec — do NOT add TTL
 * eviction here.
 */

import { useEffect, useState } from 'react'
import { resolveUrls } from '@/lib/dataApi'

// Shared across all hook instances. Key → presigned URL.
const cache = new Map<string, string>()

/** Test-only: reset the module-level cache so tests stay independent. */
export function __clearResolvedCache(): void {
  cache.clear()
}

export function useResolved(keys: string[]): Record<string, string> {
  // Force a re-render when the cache gains entries we care about.
  const [, bump] = useState(0)

  // A stable, order-independent signature of the requested keys. Keying the
  // effect on this string (not the array identity) prevents a re-fetch loop
  // when callers pass a fresh array literal each render.
  const signature = [...keys].sort().join('|')

  useEffect(() => {
    const missing = keys.filter((k) => !cache.has(k))
    if (missing.length === 0) return

    let cancelled = false
    resolveUrls(missing)
      .then((urls) => {
        if (cancelled) return
        // Only cache what the server actually returned (it may drop invalid
        // keys); missing keys just stay absent.
        for (const [key, url] of Object.entries(urls)) {
          cache.set(key, url)
        }
        bump((n) => n + 1)
      })
      .catch(() => {
        // Swallow: a failed resolve leaves keys absent, callers degrade. A
        // page reload re-attempts.
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  // Build the return map from the cache for the requested keys only.
  const out: Record<string, string> = {}
  for (const k of keys) {
    const url = cache.get(k)
    if (url !== undefined) out[k] = url
  }
  return out
}

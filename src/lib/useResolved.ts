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
 * Presigned URLs expire (~10 min server TTL), and an editing session easily
 * outlives that: with a forever-cache, any image not yet fetched would 403 and
 * never load. So each entry carries its resolve time; entries older than
 * STALE_MS are transparently re-resolved (on the next hook mount and on a
 * periodic check while mounted), and `refreshResolved` lets an `<img>` onError
 * handler force a re-resolve when a URL has already gone bad.
 */

import { useEffect, useState } from 'react'
import { resolveUrls } from '@/lib/dataApi'

/** Re-resolve entries this old — comfortably inside the ~10 min server TTL. */
const STALE_MS = 8 * 60_000

/** How often mounted hooks re-check freshness (long reader sessions). */
const RECHECK_MS = 60_000

type Entry = { url: string; at: number }

// Shared across all hook instances.
const cache = new Map<string, Entry>()
const inflight = new Set<string>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** Test-only: reset the module-level cache so tests stay independent. */
export function __clearResolvedCache(): void {
  cache.clear()
  inflight.clear()
}

/**
 * Resolve any of `keys` that are unknown or stale. In-flight keys are skipped
 * so concurrent hook instances never duplicate a request; every instance is
 * notified when new URLs land. Failures degrade silently — absent keys stay
 * absent and the periodic re-check retries.
 */
async function ensureResolved(keys: string[]): Promise<void> {
  const now = Date.now()
  const need = keys.filter((k) => {
    if (inflight.has(k)) return false
    const entry = cache.get(k)
    return !entry || now - entry.at > STALE_MS
  })
  if (need.length === 0) return

  for (const k of need) inflight.add(k)
  try {
    const urls = await resolveUrls(need)
    const at = Date.now()
    // Only cache what the server actually returned (it may drop invalid
    // keys); missing keys just stay absent.
    for (const [key, url] of Object.entries(urls)) {
      cache.set(key, { url, at })
    }
    notify()
  } catch {
    // Swallow: callers degrade; the mounted re-check retries.
  } finally {
    for (const k of need) inflight.delete(k)
  }
}

/**
 * Drop a key's cached URL and re-resolve it — for `<img>` onError recovery
 * when a presigned URL expired before the freshness check caught it.
 */
export function refreshResolved(key: string): void {
  cache.delete(key)
  void ensureResolved([key])
}

export function useResolved(keys: string[]): Record<string, string> {
  // Force a re-render when the cache gains entries (any instance's fetch).
  const [, bump] = useState(0)

  // A stable, order-independent signature of the requested keys. Keying the
  // effect on this string (not the array identity) prevents a re-fetch loop
  // when callers pass a fresh array literal each render.
  const signature = [...keys].sort().join('|')

  useEffect(() => {
    const listener = () => bump((n) => n + 1)
    listeners.add(listener)
    void ensureResolved(keys)
    const interval = setInterval(() => void ensureResolved(keys), RECHECK_MS)
    return () => {
      listeners.delete(listener)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  // Build the return map from the cache for the requested keys only. A stale
  // URL is still returned (better a maybe-good URL than a blank frame); the
  // background re-resolve swaps it as soon as the fresh one lands.
  const out: Record<string, string> = {}
  for (const k of keys) {
    const entry = cache.get(k)
    if (entry !== undefined) out[k] = entry.url
  }
  return out
}

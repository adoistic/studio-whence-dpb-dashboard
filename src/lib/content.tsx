'use client'

/**
 * content.tsx — the client-side content channel.
 *
 * Replaces the old synchronous `content.ts` (which bundled
 * public/data/content.json at build time — a data-leak path that is now gone).
 * Content is fetched at runtime, gated, via `fetchContent()` from `@/lib/dataApi`.
 *
 * Two things live here:
 *   1. The pure lookup helpers (`findLine` / `findComic` / `requireLine`) —
 *      moved verbatim from content.ts, same `(slug, …, content)` signatures, so
 *      callers can keep calling `requireLine(slug, content)` directly.
 *   2. A `ContentProvider` that fetches content once on mount (after the auth
 *      gate has rendered its children) plus `useContent` / `useLine` / `useComic`
 *      hooks that read from it.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Comic, Content, Line, LineSlug } from '@/types/content'
import { fetchContent } from '@/lib/dataApi'

// ── Pure helpers (moved from content.ts; identical signatures) ──────────────

export function findLine(slug: LineSlug, content: Content): Line | undefined {
  return content.lines.find((l) => l.slug === slug)
}

export function requireLine(slug: LineSlug, content: Content): Line {
  const line = findLine(slug, content)
  if (!line) throw new Error(`Line "${slug}" missing from content.json`)
  return line
}

export function findComic(
  line: LineSlug,
  slug: string,
  content: Content
): Comic | undefined {
  return findLine(line, content)?.comics.find((c) => c.slug === slug)
}

// ── Provider + hooks ────────────────────────────────────────────────────────

export interface ContentState {
  content: Content | null
  loading: boolean
  error?: unknown
}

const ContentContext = createContext<ContentState | null>(null)

/**
 * Fetches content once on mount and exposes it via context. It is meant to be
 * mounted inside the (authed) gate — the gate guarantees a signed-in user
 * before children render, so no auth logic lives here; the provider just
 * fetches once. A rejected fetch resolves to an error state rather than
 * throwing, so the tree never crashes on a failed load.
 */
export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ContentState>({
    content: null,
    loading: true,
  })

  useEffect(() => {
    let active = true
    fetchContent()
      .then((content) => {
        if (active) setState({ content, loading: false })
      })
      .catch((error) => {
        if (active) setState({ content: null, loading: false, error })
      })
    return () => {
      active = false
    }
  }, [])

  return <ContentContext.Provider value={state}>{children}</ContentContext.Provider>
}

/** Read the content channel. Throws if used outside a ContentProvider. */
export function useContent(): ContentState {
  const ctx = useContext(ContentContext)
  if (!ctx) {
    throw new Error('useContent must be used within a ContentProvider')
  }
  return ctx
}

/** A line by slug, or undefined while loading / if missing. */
export function useLine(slug: LineSlug): Line | undefined {
  const { content } = useContent()
  return content ? findLine(slug, content) : undefined
}

/** A comic by line + slug, or undefined while loading / if missing. */
export function useComic(line: LineSlug, slug: string): Comic | undefined {
  const { content } = useContent()
  return content ? findComic(line, slug, content) : undefined
}

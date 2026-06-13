'use client'
import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { AiConversation } from '@/types/aiConversation'

// Re-exported from dataApi so the component imports both data hooks from one
// place; the gated fetch (same base URL + Bearer ID token as readIdeaCapture)
// lives next to its sibling helpers in dataApi.ts.
export { readAiConversation } from '@/lib/dataApi'

// Unicode Private-Use-Area sentinels that wrap ChatGPT cite runs in exported
// transcripts ( … , with  separating sub-parts). Mirrors the
// Python strip_cite_tokens in tools/conversation_analysis.py.
const PUA_RUN_RE = /[\s\S]*?/g
// Bare fallback token not wrapped in PUA, e.g. "citeturn1view0",
// "fileciteturn0file0".
const BARE_TOKEN_RE = /(?:file)?cite[\w]*turn\w+/g

/**
 * Remove ChatGPT's private citation markers from `text`: strip PUA-delimited
 * runs and any bare `citeturn…` / `fileciteturn…` tokens, then collapse any
 * double space left behind to a single space (newlines untouched).
 */
export function stripCiteTokens(text: string): string {
  return text.replace(PUA_RUN_RE, '').replace(BARE_TOKEN_RE, '').replace(/  +/g, ' ')
}

export interface AiConversationsState {
  conversations: AiConversation[]
  loading: boolean
  error?: Error
}

export interface AiConversationsQuery {
  line: string
  comicSlug?: string
  figureSlug?: string
}

/**
 * Build the Firestore where-filters for an AI-conversations query. Pure so the
 * filter logic is unit-testable without standing up a listener: always filters
 * on attachTo.line, and narrows by attachTo.comicSlug / attachTo.figureSlug when
 * those are given.
 */
export function buildConvFilters({ line, comicSlug, figureSlug }: AiConversationsQuery) {
  const filters = [where('attachTo.line', '==', line)]
  if (comicSlug) filters.push(where('attachTo.comicSlug', '==', comicSlug))
  if (figureSlug) filters.push(where('attachTo.figureSlug', '==', figureSlug))
  return filters
}

/**
 * Live AI conversations attached to a line (optionally narrowed to one comic or
 * one figure).
 *
 * Mirrors useIdeaCaptures: a single onSnapshot, newest-first. Filters on
 * attachTo.line (+ attachTo.comicSlug / attachTo.figureSlug when given) and
 * orders by createdAt desc.
 */
export function useAiConversations({
  line,
  comicSlug,
  figureSlug,
}: AiConversationsQuery): AiConversationsState {
  const [state, setState] = useState<AiConversationsState>({ conversations: [], loading: true })
  useEffect(() => {
    setState({ conversations: [], loading: true })
    const filters = buildConvFilters({ line, comicSlug, figureSlug })
    const q = query(collection(db, 'aiConversations'), ...filters, orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) =>
        setState({
          conversations: snap.docs.map((d) => ({
            ...(d.data() as Omit<AiConversation, 'id'>),
            id: d.id,
          })),
          loading: false,
        }),
      (error) => setState({ conversations: [], loading: false, error }),
    )
  }, [line, comicSlug, figureSlug])
  return state
}

'use client'
import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { AiConversation } from '@/types/aiConversation'

// Re-exported from dataApi so the component imports both data hooks from one
// place; the gated fetch (same base URL + Bearer ID token as readIdeaCapture)
// lives next to its sibling helpers in dataApi.ts.
export { readAiConversation } from '@/lib/dataApi'

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

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

/**
 * Live AI conversations attached to a line (optionally narrowed to one comic).
 *
 * Mirrors useIdeaCaptures: a single onSnapshot, newest-first. Filters on
 * attachTo.line (+ attachTo.comicSlug when given) and orders by createdAt desc.
 */
export function useAiConversations({
  line,
  comicSlug,
}: {
  line: string
  comicSlug?: string
}): AiConversationsState {
  const [state, setState] = useState<AiConversationsState>({ conversations: [], loading: true })
  useEffect(() => {
    setState({ conversations: [], loading: true })
    const filters = [where('attachTo.line', '==', line)]
    if (comicSlug) filters.push(where('attachTo.comicSlug', '==', comicSlug))
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
  }, [line, comicSlug])
  return state
}

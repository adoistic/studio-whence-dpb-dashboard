'use client'
import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { IdeaCapture } from '@/types/idea'
import type { Live } from '@/lib/ideas'

/** Live captures subcollection for one idea (empty for ordinary ideas). */
export function useIdeaCaptures(ideaId: string): Live<IdeaCapture[]> {
  const [state, setState] = useState<Live<IdeaCapture[]>>({ data: [], loading: true })
  useEffect(() => {
    setState({ data: [], loading: true })
    const q = query(collection(db, 'ideas', ideaId, 'captures'), orderBy('createdAt'))
    return onSnapshot(
      q,
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ ...(d.data() as Omit<IdeaCapture, 'id'>), id: d.id })),
          loading: false,
        }),
      (error) => setState({ data: [], loading: false, error }),
    )
  }, [ideaId])
  return state
}

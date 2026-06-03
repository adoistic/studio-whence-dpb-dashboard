'use client'
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { VersionEntry } from '@/lib/feedbackTypes'

export interface ComicVersion extends VersionEntry { date?: string; note: string }

export function useComicVersions(comicId: string): { data: ComicVersion[]; loading: boolean } {
  const [s, setS] = useState<{ data: ComicVersion[]; loading: boolean }>({ data: [], loading: true })
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'comics', comicId, 'versions'), orderBy('version', 'desc')),
      (snap) => setS({ data: snap.docs.map((d) => d.data() as ComicVersion), loading: false }),
      () => setS({ data: [], loading: false }))
    return unsub
  }, [comicId])
  return s
}

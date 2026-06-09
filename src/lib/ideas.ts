'use client'
import { useEffect, useState } from 'react'
import {
  collection, query, where, orderBy, onSnapshot, setDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, type Query,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { AllowStatus } from '@/lib/auth'
import type { Idea, IdeaStatus, Visibility, R2Image } from '@/types/idea'

export interface Live<T> { data: T; loading: boolean; error?: Error }

export function newIdeaRef() { return doc(collection(db, 'ideas')) }

export interface CreateIdeaInput {
  title?: string; bodyMarkdown: string; r2Images: R2Image[]
  visibility: Visibility; recipients: string[]
}
export function createIdea(id: string, input: CreateIdeaInput, author: { email: string; name: string }) {
  return setDoc(doc(db, 'ideas', id), {
    author: author.email, authorName: author.name,
    title: input.title ?? '', bodyMarkdown: input.bodyMarkdown, r2Images: input.r2Images,
    visibility: input.visibility, recipients: input.recipients,
    status: 'new', tags: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), editedAt: null,
  })
}
export const updateIdeaBody = (id: string, patch: { title?: string; bodyMarkdown?: string; r2Images?: R2Image[] }) =>
  updateDoc(doc(db, 'ideas', id), { ...patch, editedAt: serverTimestamp(), updatedAt: serverTimestamp() })
export const setIdeaStatus = (id: string, status: IdeaStatus) =>
  updateDoc(doc(db, 'ideas', id), { status, updatedAt: serverTimestamp() })
export const setIdeaTags = (id: string, tags: string[]) =>
  updateDoc(doc(db, 'ideas', id), { tags, updatedAt: serverTimestamp() })
export const deleteIdea = (id: string) => deleteDoc(doc(db, 'ideas', id))

/** Dedupe by id, newest-first; a null createdAt (pending write) sorts first. */
export function mergeAndSort(lists: Idea[][]): Idea[] {
  const byId = new Map<string, Idea>()
  for (const list of lists) for (const i of list) byId.set(i.id, i)
  const ms = (i: Idea) => (i.createdAt ? i.createdAt.toMillis() : Number.MAX_SAFE_INTEGER)
  return [...byId.values()].sort((a, b) => ms(b) - ms(a))
}

function snapToIdeas(snap: { docs: { id: string; data: () => object }[] }): Idea[] {
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Idea)
}

/** Subscribe to all ideas the viewer may see, via per-access-path queries. */
export function useInboxIdeas(role: AllowStatus, email: string): Live<Idea[]> {
  const [lists, setLists] = useState<Record<string, Idea[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()

  useEffect(() => {
    if (!email) return
    const col = collection(db, 'ideas')
    const isAdmin = role === 'admin'
    const isSub = role === 'sub_admin'

    const queries: { key: string; q: Query }[] = isAdmin
      ? [{ key: 'all', q: query(col, orderBy('createdAt', 'desc')) }]
      : [
          { key: 'mine', q: query(col, where('author', '==', email), orderBy('createdAt', 'desc')) },
          { key: 'approved', q: query(col, where('visibility', '==', 'all_approved'), orderBy('createdAt', 'desc')) },
          { key: 'specific', q: query(col, where('recipients', 'array-contains', email), orderBy('createdAt', 'desc')) },
          ...(isSub ? [{ key: 'subs', q: query(col, where('visibility', '==', 'all_sub_admins'), orderBy('createdAt', 'desc')) }] : []),
        ]

    const unsubs = queries.map(({ key, q }) =>
      onSnapshot(q,
        (snap) => { setLists((p) => ({ ...p, [key]: snapToIdeas(snap) })); setLoading(false) },
        (err) => { setError(err as Error); setLoading(false) }))
    return () => unsubs.forEach((u) => u())
  }, [role, email])

  return { data: mergeAndSort(Object.values(lists)), loading, error }
}

export function useIdeaReads(email: string): Record<string, boolean> {
  const [seen, setSeen] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!email) return
    return onSnapshot(doc(db, 'idea_reads', email),
      (d) => setSeen(((d.data() as { seen?: Record<string, boolean> })?.seen) ?? {}))
  }, [email])
  return seen
}

export async function markIdeaSeen(email: string, id: string) {
  await setDoc(doc(db, 'idea_reads', email), { seen: { [id]: true } }, { merge: true })
}

// NOTE: this re-subscribes via useInboxIdeas (Topbar badge + /ideas page each
// mount the per-access-path listeners). The Firestore Web SDK shares the
// underlying query listeners and idea volume is tiny, so the duplication is
// acceptable for v1; revisit with a shared context only if the inbox grows.
export function useUnreadIdeaCount(role: AllowStatus, email: string): number {
  const { data } = useInboxIdeas(role, email)
  const seen = useIdeaReads(email)
  return data.filter((i) => !seen[i.id]).length
}

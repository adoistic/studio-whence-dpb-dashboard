'use client'
import { useEffect, useState } from 'react'
import {
  collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, type QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { groupThreads, type FeedbackNode, type Thread, type Status, type Anchor, type Category } from '@/lib/feedbackTypes'

export interface Live<T> { data: T; loading: boolean; error?: Error }
export interface Author { email: string; name: string; role: string }

function useFeedbackQuery(constraints: QueryConstraint[], deps: unknown[]): Live<FeedbackNode[]> {
  const [s, setS] = useState<Live<FeedbackNode[]>>({ data: [], loading: true })
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'feedback'), ...constraints),
      (snap) => setS({ data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as FeedbackNode), loading: false }),
      (err) => setS({ data: [], loading: false, error: err as Error }))
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return s
}

export function useComicFeedback(comicId: string): Live<Thread[]> {
  const { data, loading, error } = useFeedbackQuery(
    [where('comicId', '==', comicId), orderBy('createdAt', 'desc')], [comicId])
  return { data: groupThreads(data), loading, error }
}

export function useAllRoots(): Live<FeedbackNode[]> {
  return useFeedbackQuery([where('parentId', '==', null), orderBy('createdAt', 'desc')], [])
}

export function addComment(
  input: { comicId: string; line: string; anchors: Anchor[]; body: string; comicVersion: number; category?: Category },
  author: Author,
) {
  return addDoc(collection(db, 'feedback'), {
    comicId: input.comicId, line: input.line, parentId: null, anchors: input.anchors,
    authorEmail: author.email, authorName: author.name, authorRole: author.role,
    body: input.body, status: 'open', category: input.category ?? 'fact',
    comicVersion: input.comicVersion, hidden: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), editedAt: null,
  })
}

export function addReply(
  input: { comicId: string; line: string; parentId: string; body: string; comicVersion: number },
  author: Author,
) {
  return addDoc(collection(db, 'feedback'), {
    comicId: input.comicId, line: input.line, parentId: input.parentId, anchors: [],
    authorEmail: author.email, authorName: author.name, authorRole: author.role,
    body: input.body, comicVersion: input.comicVersion, hidden: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), editedAt: null,
  })
}

export const editComment = (id: string, patch: { body?: string; anchors?: Anchor[] }) =>
  updateDoc(doc(db, 'feedback', id), { ...patch, editedAt: serverTimestamp(), updatedAt: serverTimestamp() })
export const setStatus = (id: string, status: Status) =>
  updateDoc(doc(db, 'feedback', id), { status, updatedAt: serverTimestamp() })
export const hideComment = (id: string, hidden: boolean) =>
  updateDoc(doc(db, 'feedback', id), { hidden, updatedAt: serverTimestamp() })
export const deleteComment = (id: string) => deleteDoc(doc(db, 'feedback', id))

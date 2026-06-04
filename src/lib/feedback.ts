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

export function useComicFeedback(comicId: string, viewerCanModerate: boolean): Live<Thread[]> {
  // Moderators (admin/sub_admin) read every doc — drafts + hidden included.
  // Members may only read published, non-hidden docs (the deployed rules reject
  // an unfiltered member query), so the constraints add those `where`s.
  const constraints = viewerCanModerate
    ? [where('comicId', '==', comicId), orderBy('createdAt', 'desc')]
    : [
        where('comicId', '==', comicId),
        where('published', '==', true),
        where('hidden', '==', false),
        orderBy('createdAt', 'desc'),
      ]
  const { data, loading, error } = useFeedbackQuery(constraints, [comicId, viewerCanModerate])
  return { data: groupThreads(data), loading, error }
}

export function useAllRoots(viewerCanModerate: boolean): Live<FeedbackNode[]> {
  const constraints = viewerCanModerate
    ? [where('parentId', '==', null), orderBy('createdAt', 'desc')]
    : [
        where('parentId', '==', null),
        where('published', '==', true),
        where('hidden', '==', false),
        orderBy('createdAt', 'desc'),
      ]
  return useFeedbackQuery(constraints, [viewerCanModerate])
}

export function addComment(
  input: { comicId: string; line: string; anchors: Anchor[]; body: string; comicVersion: number; category?: Category; published?: boolean },
  author: Author,
) {
  return addDoc(collection(db, 'feedback'), {
    comicId: input.comicId, line: input.line, parentId: null, anchors: input.anchors,
    authorEmail: author.email, authorName: author.name, authorRole: author.role,
    body: input.body, status: 'open', category: input.category ?? 'fact',
    comicVersion: input.comicVersion, hidden: false,
    // Default draft — a member's new comment awaits moderator approval. A
    // sub-admin choosing publish-direct passes `true` (that UI is a later task).
    published: input.published ?? false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), editedAt: null,
  })
}

export function addReply(
  input: { comicId: string; line: string; parentId: string; body: string; comicVersion: number; published?: boolean },
  author: Author,
) {
  return addDoc(collection(db, 'feedback'), {
    comicId: input.comicId, line: input.line, parentId: input.parentId, anchors: [],
    authorEmail: author.email, authorName: author.name, authorRole: author.role,
    body: input.body, comicVersion: input.comicVersion, hidden: false,
    // A reply inherits its parent root's published state (the caller passes
    // `parent.published`): a reply to a published root is itself published and
    // immediately visible; a reply to a draft stays draft. Falls back to draft
    // when no value is supplied.
    published: input.published ?? false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), editedAt: null,
  })
}

export const editComment = (id: string, patch: { body?: string; anchors?: Anchor[] }) =>
  updateDoc(doc(db, 'feedback', id), { ...patch, editedAt: serverTimestamp(), updatedAt: serverTimestamp() })
export const setStatus = (id: string, status: Status) =>
  updateDoc(doc(db, 'feedback', id), { status, updatedAt: serverTimestamp() })
// Approve (publish) or un-publish a comment. Only moderators may call this per
// the Firestore rules. Publishing stamps the approver + approval time.
export const setPublished = (id: string, published: boolean, approver?: { email: string; name: string }) =>
  updateDoc(doc(db, 'feedback', id), {
    published,
    ...(published ? { approvedBy: approver?.email ?? null, approvedAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  })
export const hideComment = (id: string, hidden: boolean) =>
  updateDoc(doc(db, 'feedback', id), { hidden, updatedAt: serverTimestamp() })
export const deleteComment = (id: string) => deleteDoc(doc(db, 'feedback', id))

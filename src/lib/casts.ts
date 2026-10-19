'use client'

/**
 * casts.ts — every work's cast: drawn, not drawn yet, and generalised.
 *
 * THE ATOM IS THE COMIC. The publish pipeline (`tools/publish_work_casts.py` in the
 * content repo) writes one doc per published comic, `casts/{line}__{slug}`, holding
 * every character the book stages and every version of them. A comic page shows its
 * own cast; a subject, a programme and the repo-wide page show the UNION of the casts
 * of the comics the viewer may see. Because each doc carries its comic's line, subject
 * and programme, the Firestore rule is the comics rule verbatim, so a member is never
 * sent a cast for a book they are not allocated, and the union is right by
 * construction.
 *
 * A line can also publish `casts/{line}__library`: sheets drawn for the line's cast
 * and staged on no page yet. A programme view folds in the library entries tagged with
 * that programme; the repo-wide view folds in all of them.
 *
 * Identity is `(line, id)`, never `id` alone: manga's Rama and Indic's Rama are two
 * characters with two designs. Shared IP (Little Chanakya and friends) has the line
 * `shared`, so it merges into one entry across every line that stages it.
 */

import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { surfaceOfLineSlug, type Surface } from '@/lib/surface'
import type { CastDoc } from '@/lib/castModel'

export * from '@/lib/castModel'

// ─── reading the docs ─────────────────────────────────────────────────────────

const TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; p: Promise<CastDoc | null> }>()
const subjectCache = new Map<string, { at: number; p: Promise<CastDoc[]> }>()

/** Test-only. */
export function __clearCastCache(): void {
  cache.clear()
  subjectCache.clear()
}

/**
 * One cast doc, cached for five minutes so moving between a comic, its subject and its
 * programme does not re-read the same books. A missing doc and a denied read are both
 * null — a book with no cast published, or one this viewer may not see.
 */
export function fetchCast(comicId: string): Promise<CastDoc | null> {
  const hit = cache.get(comicId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p
  const p = getDoc(doc(db, 'casts', comicId))
    .then((snap) => (snap.exists() ? (snap.data() as CastDoc) : null))
    .catch(() => null)
  cache.set(comicId, { at: Date.now(), p })
  return p
}

export interface CastLoad {
  data: CastDoc[] | null
  loading: boolean
}

/** The casts of these comics (plus any library docs named), read in parallel. */
export function useCasts(ids: string[]): CastLoad {
  const signature = useMemo(() => Array.from(new Set(ids)).sort().join('|'), [ids])
  const [state, setState] = useState<CastLoad>({ data: null, loading: true })
  useEffect(() => {
    let active = true
    const list = signature ? signature.split('|') : []
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => ({ data: s.data, loading: true }))
    Promise.all(list.map(fetchCast)).then((docs) => {
      if (active) setState({ data: docs.filter((d): d is CastDoc => d !== null), loading: false })
    })
    return () => { active = false }
  }, [signature])
  return state
}

/**
 * Every cast this viewer may see on a surface, for the repo-wide page.
 *
 * A moderator reads the whole collection in one query (the rules allow it: every doc
 * is readable to them). A member cannot list a collection holding docs they may not
 * read, so they read their visible comics' casts by id, plus the libraries of the
 * lines they can see — a denied library is simply absent.
 */
export function useSurfaceCasts(
  canModerate: boolean,
  visibleComicIds: string[] | null,
  surface: Surface | null,
): CastLoad {
  const ids = useMemo(() => {
    if (canModerate || !visibleComicIds) return []
    const lines = new Set(visibleComicIds.map((id) => id.split('__')[0]))
    return [...visibleComicIds, ...Array.from(lines).map((l) => `${l}__library`)]
  }, [canModerate, visibleComicIds])
  const byId = useCasts(ids)
  const [all, setAll] = useState<CastLoad>({ data: null, loading: true })
  useEffect(() => {
    if (!canModerate) return
    let active = true
    getDocs(collection(db, 'casts'))
      .then((snap) => {
        if (active) setAll({ data: snap.docs.map((d) => d.data() as CastDoc), loading: false })
      })
      .catch(() => { if (active) setAll({ data: [], loading: false }) })
    return () => { active = false }
  }, [canModerate])
  const source = canModerate ? all : visibleComicIds ? byId : { data: null, loading: true }
  const scoped = useMemo(
    () => source.data?.filter((d) => !surface || surfaceOfLineSlug(d.line) === surface) ?? null,
    [source.data, surface],
  )
  return { data: scoped, loading: source.loading }
}


/**
 * A subject's book casts. A moderator may read every cast, so one indexed query by
 * `subject_slug` answers at once, without waiting for the comics scan that a member's
 * view must go through; a member reads their visible comics' casts by id, as ever.
 */
export function useSubjectCasts(subject: string, canModerate: boolean, memberIds: string[]): CastLoad {
  const viaIds = useCasts(canModerate ? [] : memberIds)
  const [direct, setDirect] = useState<CastLoad>({ data: null, loading: true })
  useEffect(() => {
    if (!canModerate || !subject) return
    let active = true
    const hit = subjectCache.get(subject)
    const p = hit && Date.now() - hit.at < TTL_MS
      ? hit.p
      : getDocs(query(collection(db, 'casts'), where('subject_slug', '==', subject)))
          .then((snap) => snap.docs.map((d) => d.data() as CastDoc))
          .catch(() => [] as CastDoc[])
    if (!hit || hit.p !== p) subjectCache.set(subject, { at: Date.now(), p })
    p.then((data) => { if (active) setDirect({ data, loading: false }) })
    return () => { active = false }
  }, [subject, canModerate])
  return canModerate ? direct : viaIds
}

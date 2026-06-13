'use client'

import { useEffect, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, where, type QueryConstraint } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Comic, Figure, Headline, Line, ResearchSource } from '@/types/content'

export interface Async<T> { data: T | null; loading: boolean; error?: Error }

function useAsync<T>(run: () => Promise<T>, deps: unknown[]): Async<T> {
  const [s, setS] = useState<Async<T>>({ data: null, loading: true })
  useEffect(() => {
    let active = true
    setS({ data: null, loading: true })
    run()
      .then((data) => { if (active) setS({ data, loading: false }) })
      .catch((err) => { if (active) setS({ data: null, loading: false, error: err instanceof Error ? err : new Error(String(err)) }) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return s
}

const docData = <T,>(snap: { exists: () => boolean; data: () => unknown }): T | null =>
  snap.exists() ? (snap.data() as T) : null
const listData = <T,>(snap: { docs: { data: () => unknown }[] }): T[] => snap.docs.map((d) => d.data() as T)

export interface CatalogMeta { generated_at: string; source_sha: string; headline: Headline; activity: unknown[] }
export const useHeadline = () => useAsync<CatalogMeta>(async () => {
  const v = docData<CatalogMeta>(await getDoc(doc(db, 'meta', 'catalog')))
  if (!v) throw new Error('catalog meta missing'); return v
}, [])

export interface MethodologyDocs { readKey: string; downloadKey: string; bytes: number; generatedAt: string }
export const useMethodology = () => useAsync<MethodologyDocs | null>(async () =>
  docData<MethodologyDocs>(await getDoc(doc(db, 'meta', 'methodology'))) ?? null, [])

export interface ResearchFile { label: string; readKey: string; bytes: number }
export interface ResearchGroup { disease: string; title: string; files: ResearchFile[] }
export interface ResearchManifest {
  generatedAt: string
  line: string
  groups: ResearchGroup[]
  topLevel: ResearchFile[]
}
export const useResearchManifest = (line: string) => useAsync<ResearchManifest | null>(async () =>
  docData<ResearchManifest>(await getDoc(doc(db, 'meta', `research_${line}`))) ?? null, [line])

export const useLines = () => useAsync<Line[]>(async () => listData<Line>(await getDocs(collection(db, 'lines'))), [])

export const useComic = (line: string, slug: string) =>
  useAsync<Comic>(async () => {
    const v = docData<Comic>(await getDoc(doc(db, 'comics', `${line}__${slug}`)))
    if (!v) throw new Error('comic not found'); return v
  }, [line, slug])

export interface ComicFilters { line?: string; series?: string; status?: string; subject_slug?: string }
export const useComics = (f: ComicFilters = {}) =>
  useAsync<Comic[]>(async () => {
    const cs: QueryConstraint[] = []
    if (f.line) cs.push(where('line', '==', f.line))
    if (f.series) cs.push(where('series', '==', f.series))
    if (f.status) cs.push(where('status', '==', f.status))
    if (f.subject_slug) cs.push(where('subject_slug', '==', f.subject_slug))
    return listData<Comic>(await getDocs(query(collection(db, 'comics'), ...cs)))
  }, [f.line, f.series, f.status, f.subject_slug])

export const useFigures = (series?: string) =>
  useAsync<Figure[]>(async () => {
    const cs: QueryConstraint[] = series ? [where('series', '==', series)] : []
    return listData<Figure>(await getDocs(query(collection(db, 'figures'), ...cs)))
  }, [series])

export const useFigure = (slug: string) =>
  useAsync<{ figure: Figure; sources: ResearchSource[] } | null>(async () => {
    const f = docData<Figure>(await getDoc(doc(db, 'figures', slug)))
    if (!f) return null
    const sources = listData<ResearchSource>(await getDocs(collection(db, 'figures', slug, 'sources')))
    return { figure: { ...f, sources }, sources }
  }, [slug])

export interface PersonDoc { slug: string; name: string; line: string; series: string; stage: string; stage_rank: number; comic_count: number; sources_count: number | null; words: number | null; furthest_comic_slug: string | null; is_orphan: boolean }
export const usePeople = (line: string) =>
  useAsync<PersonDoc[]>(async () =>
    listData<PersonDoc>(await getDocs(query(collection(db, 'people'), where('line', '==', line)))), [line])

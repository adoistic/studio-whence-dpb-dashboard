'use client'

import { useEffect, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, where, type QueryConstraint } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { surfaceOfLineSlug, useActiveSurface } from '@/lib/surface'
import type { Comic, Coverage, Figure, Headline, Line, Program, ResearchSource } from '@/types/content'

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

// The studio-status coverage roll-up (meta/coverage), readable by any
// allowlisted member like meta/catalog. Drives the home-page CoverageOverview.
export const useCoverage = () => useAsync<Coverage>(async () => {
  const v = docData<Coverage>(await getDoc(doc(db, 'meta', 'coverage')))
  if (!v) throw new Error('coverage meta missing'); return v
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

// ─── Surface scoping ──────────────────────────────────────────────────────────
//
// The two surfaces are separate bodies of work, not a view filter on one. Every
// cross-line LISTING is scoped to the surface being browsed, here at the single
// choke point, so nothing on the manga side is reachable by normal navigation
// from the comics side or the reverse — line menus, category cards, status,
// reviews, admin listings, all of them, including pages written later.
//
// Direct links are deliberately NOT blocked: a URL someone was sent should open.
// Access is still decided entirely by the allocation and the Firestore rules.

function useSurfaceScope(): (lineSlug: string | null | undefined) => boolean {
  const { surface } = useActiveSurface()
  return (lineSlug) => !surface || surfaceOfLineSlug(lineSlug) === surface
}

export const useLines = () => {
  const inSurface = useSurfaceScope()
  return useAsync<Line[]>(async () => {
    const all = listData<Line>(await getDocs(collection(db, 'lines')))
    return all.filter((l) => inSurface(l.slug))
  }, [useActiveSurface().surface])
}

/** Every line regardless of surface — for the few places that must not scope. */
export const useAllLines = () =>
  useAsync<Line[]>(async () => listData<Line>(await getDocs(collection(db, 'lines'))), [])

export const useComic = (line: string, slug: string) =>
  useAsync<Comic>(async () => {
    const v = docData<Comic>(await getDoc(doc(db, 'comics', `${line}__${slug}`)))
    if (!v) throw new Error('comic not found'); return v
  }, [line, slug])

export interface ComicFilters { line?: string; series?: string; status?: string; subject_slug?: string; program_slug?: string }
export const useComics = (f: ComicFilters = {}) => {
  const inSurface = useSurfaceScope()
  const { surface } = useActiveSurface()
  return useAsync<Comic[]>(async () => {
    const cs: QueryConstraint[] = []
    if (f.line) cs.push(where('line', '==', f.line))
    if (f.series) cs.push(where('series', '==', f.series))
    if (f.status) cs.push(where('status', '==', f.status))
    if (f.subject_slug) cs.push(where('subject_slug', '==', f.subject_slug))
    if (f.program_slug) cs.push(where('program_slug', '==', f.program_slug))
    const all = listData<Comic>(await getDocs(query(collection(db, 'comics'), ...cs)))
    // Scoped unless the caller asked for one specific line, in which case the
    // line itself already decides the surface.
    return f.line ? all : all.filter((c) => inSurface(c.line))
  }, [f.line, f.series, f.status, f.subject_slug, f.program_slug, surface])
}

// Program tier (Line → Program → Subject) — general across all lines.
// Program docs are navigational metadata (title/blurb/emblem), readable by any
// allowlisted member like lines; the gated content lives in the comics/dossiers
// inside, so the Program page composes useVisibleComics/useVisibleFigures
// filtered by program_slug rather than raw-querying gated collections here.
export const usePrograms = (line: string) =>
  useAsync<Program[]>(async () => {
    const ps = listData<Program>(await getDocs(query(collection(db, 'programs'), where('line', '==', line))))
    return ps.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.slug.localeCompare(b.slug))
  }, [line])

// Every program across every line, in one read. Program docs are navigational
// metadata readable by any allowlisted member (the rule above), so a whole-
// collection list is allowed here where a gated collection would not be.
export const useAllPrograms = () =>
  useAsync<Program[]>(async () => {
    const ps = listData<Program>(await getDocs(collection(db, 'programs')))
    return ps.sort((a, b) =>
      a.line.localeCompare(b.line) || (a.order ?? 99) - (b.order ?? 99) || a.slug.localeCompare(b.slug))
  }, [])

export const useProgram = (line: string, slug: string) =>
  useAsync<Program | null>(async () =>
    docData<Program>(await getDoc(doc(db, 'programs', `${line}__${slug}`))), [line, slug])

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

'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { readMarkdown } from '@/lib/dataApi'
import { buildCitationMap, excerptPassage } from '@/lib/provenance'
import type { TooltipState } from '@/components/ProvenanceTooltip'
import type { Content } from '@/types/content'

const MARKER_SEL = '.cs-src, .cs-src-art'

export function useProvenanceMarkers(
  containerRef: RefObject<HTMLElement | null>,
  content: Content | null,
  draftText: string | null | undefined,
): TooltipState | null {
  const [tip, setTip] = useState<TooltipState | null>(null)
  const citationMap = useMemo(() => buildCitationMap(content), [content])
  const cache = useRef<Map<string, string>>(new Map())
  const activeToken = useRef<string | null>(null)
  // Markers we've already wired listeners onto. A WeakSet so detached nodes (the
  // consumer re-renders dangerouslySetInnerHTML and React swaps the marker nodes)
  // are GC'd with their listeners and never re-touched.
  const wired = useRef<WeakSet<HTMLElement>>(new WeakSet())
  // Stable handler closures kept in refs so a listener bound once to a node always
  // runs the latest logic (current citationMap etc.) without re-binding.
  const showRef = useRef<(m: HTMLElement) => void>(() => {})
  const hideRef = useRef<() => void>(() => {})

  const loadExcerpt = async (key: string, line: number, token: string) => {
    let text = cache.current.get(key)
    if (text == null) {
      try {
        text = await readMarkdown('research/' + key)
        cache.current.set(key, text)
      } catch {
        if (activeToken.current === token) setTip((t) => (t ? { ...t, excerpt: { status: 'error' } } : t))
        return
      }
    }
    if (activeToken.current !== token) return
    const passage = excerptPassage(text, line)
    setTip((t) =>
      t
        ? { ...t, excerpt: passage ? { status: 'ready', lines: [passage], citedIndex: 0 } : { status: 'error' } }
        : t,
    )
  }

  showRef.current = (m: HTMLElement) => {
    const key = m.getAttribute('data-key') ?? ''
    const line = Number(m.getAttribute('data-line')) || 0
    const refnum = Number(m.getAttribute('data-refnum')) || 0
    const rect = m.getBoundingClientRect()
    const citation = citationMap.get(key) ?? null
    const fallbackLabel = key.split('/').pop()?.replace(/\.md$/, '') || key || 'source'
    const token = `${key}:${line}`
    activeToken.current = token
    setTip({ rect, refnum, line, citation, fallbackLabel, excerpt: { status: 'loading' } })
    void loadExcerpt(key, line, token)
  }
  hideRef.current = () => {
    activeToken.current = null
    setTip(null)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el || !draftText) return

    // number the markers (idempotent: original aria-label preserved in data-base-label)
    const markers = Array.from(el.querySelectorAll<HTMLElement>(MARKER_SEL))
    markers.forEach((m, i) => {
      const n = i + 1
      m.textContent = String(n)
      m.setAttribute('data-refnum', String(n))
      const base = m.getAttribute('data-base-label') ?? m.getAttribute('aria-label') ?? 'source'
      m.setAttribute('data-base-label', base)
      m.setAttribute('aria-label', `reference ${n}: ${base}`)

      // Bind per-marker, once. Delegating on `el` would miss a mouseout dispatched
      // on a marker the consumer's re-render has already swapped out and detached;
      // a listener on the node itself still fires for events targeting that node.
      // Bind-once (WeakSet) avoids stacking duplicates on markers that persist.
      if (!wired.current.has(m)) {
        wired.current.add(m)
        const onOver = (e: Event) => showRef.current((e.currentTarget as HTMLElement) ?? m)
        const onOut = () => hideRef.current()
        m.addEventListener('mouseover', onOver)
        m.addEventListener('mouseout', onOut)
        m.addEventListener('focusin', onOver)
        m.addEventListener('focusout', onOut)
      }
    })
  }) // re-run every render: dangerouslySetInnerHTML recreates marker nodes on a
  //    parent re-render, so numbering + listener wiring must be re-applied to them.

  return tip
}

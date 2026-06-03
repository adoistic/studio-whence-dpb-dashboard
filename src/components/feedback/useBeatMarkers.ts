'use client'
import { useEffect, type RefObject } from 'react'
import type { Thread } from '@/lib/feedbackTypes'
import { assignBadges } from '@/components/feedback/badges'
import { BADGE_PALETTE } from '@/components/feedback/constants'

export function indexBeats(el: HTMLElement): Map<string, HTMLElement> {
  const m = new Map<string, HTMLElement>()
  el.querySelectorAll<HTMLElement>('[data-beat-ref]').forEach((b) => {
    const ref = b.getAttribute('data-beat-ref')
    if (ref) m.set(ref, b)
  })
  return m
}

// Inject per-beat number badges + a hover "comment" affordance into the rendered
// draft. Re-runs every render because dangerouslySetInnerHTML recreates the beat
// nodes on a parent re-render (same reason as useProvenanceMarkers).
export function useBeatMarkers(
  containerRef: RefObject<HTMLElement | null>,
  threads: Thread[],
  draftText: string | null | undefined,
  handlers: { onSelectThread: (id: string) => void; onStartComment: (beatRef: string) => void; activeThreadId: string | null },
): void {
  useEffect(() => {
    const el = containerRef.current
    if (!el || !draftText) return
    const beats = indexBeats(el)
    const badges = assignBadges(threads)

    el.querySelectorAll('.cs-beat-badge, .cs-beat-comment').forEach((n) => n.remove())
    el.querySelectorAll('.cs-beat-pulse').forEach((n) => n.classList.remove('cs-beat-pulse'))

    badges.forEach((badge, threadId) => {
      const colour = BADGE_PALETTE[(badge.num - 1) % BADGE_PALETTE.length]
      for (const ref of badge.refs) {
        const beat = beats.get(ref)
        if (!beat) continue
        if (threadId === handlers.activeThreadId) beat.classList.add('cs-beat-pulse')
        const b = document.createElement('button')
        b.className = 'cs-beat-badge'
        b.textContent = String(badge.num)
        b.style.background = colour
        b.setAttribute('aria-label', `feedback ${badge.num}`)
        b.addEventListener('click', () => handlers.onSelectThread(threadId))
        beat.prepend(b)
      }
    })

    beats.forEach((beat, ref) => {
      const c = document.createElement('button')
      c.className = 'cs-beat-comment'
      c.textContent = '💬'
      c.setAttribute('aria-label', `comment on beat ${ref}`)
      c.addEventListener('click', () => handlers.onStartComment(ref))
      beat.appendChild(c)
    })
  })
}

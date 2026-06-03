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

// Inject per-beat number badges, a persistent line highlight on anchored beats,
// and a discoverable "Comment" affordance into the rendered draft. Re-runs every
// render because dangerouslySetInnerHTML recreates the beat nodes on a parent
// re-render (same reason as useProvenanceMarkers).
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

    // Clear any previous decorations so re-injection stays idempotent.
    el.querySelectorAll('.cs-beat-badge, .cs-beat-comment').forEach((n) => n.remove())
    el.querySelectorAll('.cs-beat-anchored, .cs-beat-pulse, .cs-beat-active').forEach((n) => {
      n.classList.remove('cs-beat-anchored', 'cs-beat-pulse', 'cs-beat-active')
      ;(n as HTMLElement).style.removeProperty('--beat-colour')
    })

    // Anchored beats: persistent coloured highlight + numbered margin badge.
    badges.forEach((badge, threadId) => {
      const colour = BADGE_PALETTE[(badge.num - 1) % BADGE_PALETTE.length]
      const isActive = threadId === handlers.activeThreadId
      for (const ref of badge.refs) {
        const beat = beats.get(ref)
        if (!beat) continue
        beat.classList.add('cs-beat-anchored')
        beat.style.setProperty('--beat-colour', colour)
        if (isActive) {
          // Keep both classes: cs-beat-pulse (legacy/tested) + the stronger active highlight.
          beat.classList.add('cs-beat-pulse', 'cs-beat-active')
        }
        const b = document.createElement('button')
        b.className = 'cs-beat-badge'
        b.textContent = String(badge.num)
        b.style.background = colour
        b.setAttribute('aria-label', `feedback ${badge.num}`)
        b.addEventListener('click', () => handlers.onSelectThread(threadId))
        beat.prepend(b)
      }
    })

    // Every beat: a discoverable "Comment" pill revealed on hover/focus-within.
    beats.forEach((beat, ref) => {
      const c = document.createElement('button')
      c.className = 'cs-beat-comment'
      c.type = 'button'
      const icon = document.createElement('span')
      icon.className = 'cs-beat-comment-icon'
      icon.setAttribute('aria-hidden', 'true')
      icon.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
      const label = document.createElement('span')
      label.className = 'cs-beat-comment-label'
      label.textContent = 'Comment'
      c.append(icon, label)
      c.setAttribute('aria-label', `comment on beat ${ref}`)
      c.addEventListener('click', () => handlers.onStartComment(ref))
      beat.appendChild(c)
    })
  })
}

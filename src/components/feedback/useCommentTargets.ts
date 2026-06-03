'use client'
import { useEffect, type RefObject } from 'react'
import type { Anchor, Thread } from '@/lib/feedbackTypes'
import { assignBadges } from '@/components/feedback/badges'
import { BADGE_PALETTE } from '@/components/feedback/constants'
import { indexUnits, anchorFromUnit, parseAnchorRef } from '@/components/feedback/anchorRef'

export interface CommentTargetOptions {
  /** Refs of units currently in the selection. */
  selectedRefs: Set<string>
  /** Toggle a unit into/out of the selection (anchor built from the unit). */
  onToggleSelect: (anchor: Anchor) => void
  /** Click an existing-anchor badge → focus that thread. */
  onSelectThread: (id: string) => void
  /** The active thread (its units get the strong highlight). */
  activeThreadId: string | null
}

// The selectable-unit kinds, in widest-first order, with the attribute that
// identifies each and the wrapper class the select-toggle attaches to.
const UNIT_LEVELS = [
  { attr: 'data-page-ref', toggleClass: 'cs-page-select', hostSel: '.cs-page-h, h2' },
  { attr: 'data-panel-ref', toggleClass: 'cs-panel-select', hostSel: '.cs-panel-h' },
  { attr: 'data-beat-ref', toggleClass: 'cs-beat-select', hostSel: null },
] as const

// All injected/added artefacts we own — cleared before every re-inject so the
// effect stays idempotent across the dangerouslySetInnerHTML node recreation.
const INJECTED_SELECTOR =
  '.cs-beat-badge, .cs-unit-select'
const TOGGLED_CLASSES = [
  'cs-beat-anchored',
  'cs-beat-pulse',
  'cs-beat-active',
  'cs-unit-selectable',
  'cs-unit-selected',
]

/**
 * Decorate the rendered comic draft for commenting. On every (re)render it:
 *  1. Highlights each thread's anchored unit (beat/panel/page) in the thread's
 *     colour + a numbered badge; the active thread gets a stronger highlight.
 *  2. Adds a clear "＋ Select / ✓ Selected" toggle to every selectable unit
 *     (page, panel, beat) and reflects the current `selectedRefs`.
 *
 * Re-runs every render because the draft HTML is injected via
 * dangerouslySetInnerHTML, which recreates these nodes on a parent re-render.
 */
export function useCommentTargets(
  containerRef: RefObject<HTMLElement | null>,
  threads: Thread[],
  draftText: string | null | undefined,
  opts: CommentTargetOptions,
): void {
  useEffect(() => {
    const el = containerRef.current
    if (!el || !draftText) return
    const units = indexUnits(el)
    const badges = assignBadges(threads)

    // ── Clear previous decorations (idempotent across node recreation) ───────
    el.querySelectorAll(INJECTED_SELECTOR).forEach((n) => n.remove())
    el.querySelectorAll<HTMLElement>(`.${TOGGLED_CLASSES.join(', .')}`).forEach((n) => {
      n.classList.remove(...TOGGLED_CLASSES)
      n.style.removeProperty('--beat-colour')
    })

    // ── 1. Existing-anchor display ───────────────────────────────────────────
    badges.forEach((badge, threadId) => {
      const colour = BADGE_PALETTE[(badge.num - 1) % BADGE_PALETTE.length]
      const isActive = threadId === opts.activeThreadId
      for (const ref of badge.refs) {
        const unit = units.get(ref)
        if (!unit) continue
        unit.classList.add('cs-beat-anchored')
        unit.style.setProperty('--beat-colour', colour)
        if (isActive) unit.classList.add('cs-beat-pulse', 'cs-beat-active')
        const b = document.createElement('button')
        b.className = 'cs-beat-badge'
        b.type = 'button'
        b.textContent = String(badge.num)
        b.style.background = colour
        b.setAttribute('aria-label', `feedback ${badge.num}`)
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          opts.onSelectThread(threadId)
        })
        unit.prepend(b)
      }
    })

    // ── 2. Select affordances on every unit ──────────────────────────────────
    for (const level of UNIT_LEVELS) {
      el.querySelectorAll<HTMLElement>(`[${level.attr}]`).forEach((unit) => {
        const ref = unit.getAttribute(level.attr)
        if (!ref || !parseAnchorRef(ref)) return

        const selected = opts.selectedRefs.has(ref)
        unit.classList.add('cs-unit-selectable')
        if (selected) unit.classList.add('cs-unit-selected')

        // Snapshot the anchor now, BEFORE the toggle is appended, so the
        // toggle's own label can't leak into a beat's textContent.
        const anchor = anchorFromUnit(ref, unit)

        const toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = `cs-unit-select ${level.toggleClass}${selected ? ' is-selected' : ''}`
        toggle.setAttribute('aria-pressed', selected ? 'true' : 'false')
        toggle.setAttribute('aria-label', `${selected ? 'Deselect' : 'Select'} ${ref}`)

        const box = document.createElement('span')
        box.className = 'cs-unit-select-box'
        box.setAttribute('aria-hidden', 'true')
        box.textContent = selected ? '✓' : '＋'
        const txt = document.createElement('span')
        txt.className = 'cs-unit-select-label'
        txt.textContent = selected ? 'Selected' : 'Select'
        toggle.append(box, txt)

        toggle.addEventListener('click', (e) => {
          e.stopPropagation()
          if (anchor) opts.onToggleSelect(anchor)
        })

        // Place the toggle where it reads cleanly per level: pages/panels next
        // to their header label; beats at the line's inline-end.
        if (level.hostSel) {
          const host = unit.querySelector<HTMLElement>(level.hostSel)
          if (host) host.appendChild(toggle)
          else unit.prepend(toggle)
        } else {
          unit.appendChild(toggle)
        }
      })
    }
  })
}

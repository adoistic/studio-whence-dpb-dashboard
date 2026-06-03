import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { indexBeats, useBeatMarkers } from '@/components/feedback/useBeatMarkers'
import type { Thread } from '@/lib/feedbackTypes'

// ─── indexBeats (pure) ───────────────────────────────────────────────────────

describe('indexBeats', () => {
  it('maps every data-beat-ref element by its ref', () => {
    const el = document.createElement('div')
    el.innerHTML = '<p class="cs-caption" data-beat-ref="p1.pl1.b1">a</p><p class="cs-dialogue" data-beat-ref="p1.pl1.b2">b</p>'
    const idx = indexBeats(el)
    expect([...idx.keys()]).toEqual(['p1.pl1.b1', 'p1.pl1.b2'])
    expect(idx.get('p1.pl1.b1')?.textContent).toBe('a')
  })
})

// ─── useBeatMarkers (lifecycle) ───────────────────────────────────────────────

function makeContainer(html: string): HTMLDivElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

const thread = (id: string, refs: string[]): Thread => ({
  root: {
    id,
    comicId: 'c',
    line: 'l',
    parentId: null,
    anchors: refs.map((ref) => ({ kind: 'beat' as const, ref, page: 1, panel: 1, snapshot: '' })),
    authorEmail: '',
    authorName: '',
    authorRole: '',
    body: '',
    comicVersion: 1,
    hidden: false,
    createdAt: 1,
  },
  replies: [],
})

describe('useBeatMarkers lifecycle', () => {
  let el: HTMLDivElement

  beforeEach(() => {
    el = makeContainer(
      '<p class="cs-caption" data-beat-ref="p1.pl1.b1">a</p>' +
      '<p class="cs-caption" data-beat-ref="p2.pl1.b1">b</p>',
    )
  })

  it('injects badges on anchored beats, idempotently, with pulse + wired clicks', () => {
    const ref = { current: el }
    const onSelectThread = vi.fn()
    const onStartComment = vi.fn()
    const threads = [thread('t1', ['p1.pl1.b1', 'p2.pl1.b1'])] // multi-anchor thread

    const { rerender } = renderHook(
      (props: { active: string | null }) =>
        useBeatMarkers(ref, threads, 'draft', {
          onSelectThread,
          onStartComment,
          activeThreadId: props.active,
        }),
      { initialProps: { active: 't1' } },
    )

    // (a) one badge per anchored beat
    const badges = el.querySelectorAll('.cs-beat-badge')
    expect(badges.length).toBe(2)

    // (b) same badge number for both beats of a multi-anchor thread
    expect(badges[0].textContent).toBe('1')
    expect(badges[1].textContent).toBe('1')

    // (d) active thread's beats get cs-beat-pulse
    expect(el.querySelectorAll('.cs-beat-pulse').length).toBe(2)

    // (e) clicking a badge calls onSelectThread with thread id
    ;(badges[0] as HTMLButtonElement).click()
    expect(onSelectThread).toHaveBeenCalledWith('t1')

    // (e) clicking a comment affordance calls onStartComment with the beat ref
    const firstAffordance = el.querySelector('.cs-beat-comment') as HTMLButtonElement
    firstAffordance.click()
    expect(onStartComment).toHaveBeenCalled()

    // (c) re-running the effect does NOT duplicate badges (idempotent clear/re-inject)
    rerender({ active: 't1' })
    expect(el.querySelectorAll('.cs-beat-badge').length).toBe(2) // still 2, not 4

    document.body.removeChild(el)
  })
})

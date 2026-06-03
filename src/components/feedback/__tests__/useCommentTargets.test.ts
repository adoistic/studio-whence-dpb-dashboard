import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCommentTargets } from '@/components/feedback/useCommentTargets'
import { indexUnits } from '@/components/feedback/anchorRef'
import type { Anchor, Thread } from '@/lib/feedbackTypes'

// ─── indexUnits (pure) ───────────────────────────────────────────────────────

describe('indexUnits', () => {
  it('maps page, panel, and beat refs by their attribute value', () => {
    const el = document.createElement('div')
    el.innerHTML =
      '<section class="cs-page" data-page-ref="p1">' +
      '<div class="cs-panel" data-panel-ref="p1.pl1">' +
      '<p class="cs-caption" data-beat-ref="p1.pl1.b1">a</p>' +
      '<p class="cs-dialogue" data-beat-ref="p1.pl1.b2">b</p>' +
      '</div></section>'
    const idx = indexUnits(el)
    expect([...idx.keys()]).toEqual(['p1', 'p1.pl1', 'p1.pl1.b1', 'p1.pl1.b2'])
    expect(idx.get('p1.pl1.b1')?.textContent).toBe('a')
  })
})

// ─── useCommentTargets (lifecycle) ────────────────────────────────────────────

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

const PAGE_HTML =
  '<section class="cs-page" data-page-ref="p1"><p class="cs-page-h">Page 1</p>' +
  '<div class="cs-panel" data-panel-ref="p1.pl1"><p class="cs-panel-h">Panel 1</p>' +
  '<p class="cs-caption" data-beat-ref="p1.pl1.b1">a</p></div></section>' +
  '<section class="cs-page" data-page-ref="p2"><p class="cs-page-h">Page 2</p>' +
  '<div class="cs-panel" data-panel-ref="p2.pl1"><p class="cs-panel-h">Panel 1</p>' +
  '<p class="cs-caption" data-beat-ref="p2.pl1.b1">b</p></div></section>'

describe('useCommentTargets lifecycle', () => {
  let el: HTMLDivElement

  beforeEach(() => {
    el = makeContainer(PAGE_HTML)
  })

  it('renders anchored badges idempotently with active highlight + wired clicks', () => {
    const ref = { current: el }
    const onSelectThread = vi.fn()
    const onToggleSelect = vi.fn()
    const threads = [thread('t1', ['p1.pl1.b1', 'p2.pl1.b1'])]

    const { rerender } = renderHook(
      (props: { active: string | null }) =>
        useCommentTargets(ref, threads, 'draft', {
          selectedRefs: new Set<string>(),
          onToggleSelect,
          onSelectThread,
          activeThreadId: props.active,
        }),
      { initialProps: { active: 't1' } },
    )

    const badges = el.querySelectorAll('.cs-beat-badge')
    expect(badges.length).toBe(2)
    expect(badges[0].textContent).toBe('1')
    expect(badges[1].textContent).toBe('1')
    expect(el.querySelectorAll('.cs-beat-pulse').length).toBe(2)

    ;(badges[0] as HTMLButtonElement).click()
    expect(onSelectThread).toHaveBeenCalledWith('t1')

    // idempotent: re-running does not duplicate badges
    rerender({ active: 't1' })
    expect(el.querySelectorAll('.cs-beat-badge').length).toBe(2)
  })

  it('adds a select toggle to every page/panel/beat unit', () => {
    const ref = { current: el }
    renderHook(() =>
      useCommentTargets(ref, [], 'draft', {
        selectedRefs: new Set<string>(),
        onToggleSelect: vi.fn(),
        onSelectThread: vi.fn(),
        activeThreadId: null,
      }),
    )
    // 2 pages + 2 panels + 2 beats = 6 toggles
    expect(el.querySelectorAll('.cs-unit-select').length).toBe(6)
    expect(el.querySelectorAll('.cs-page-select').length).toBe(2)
    expect(el.querySelectorAll('.cs-panel-select').length).toBe(2)
    expect(el.querySelectorAll('.cs-beat-select').length).toBe(2)
    expect(el.querySelectorAll('.cs-unit-selectable').length).toBe(6)
  })

  it('clicking a select toggle calls onToggleSelect with an anchor built from the unit', () => {
    const ref = { current: el }
    const onToggleSelect = vi.fn<(a: Anchor) => void>()
    renderHook(() =>
      useCommentTargets(ref, [], 'draft', {
        selectedRefs: new Set<string>(),
        onToggleSelect,
        onSelectThread: vi.fn(),
        activeThreadId: null,
      }),
    )
    const pageToggle = el.querySelector('.cs-page-select') as HTMLButtonElement
    pageToggle.click()
    expect(onToggleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'page', ref: 'p1', page: 1, snapshot: 'Page 1' }),
    )

    const beatToggle = el.querySelector('.cs-beat-select') as HTMLButtonElement
    beatToggle.click()
    expect(onToggleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'beat', ref: 'p1.pl1.b1', page: 1, panel: 1, snapshot: 'a' }),
    )
  })

  it('reflects selected refs as selected toggles + highlighted units', () => {
    const ref = { current: el }
    renderHook(() =>
      useCommentTargets(ref, [], 'draft', {
        selectedRefs: new Set(['p1', 'p2.pl1.b1']),
        onToggleSelect: vi.fn(),
        onSelectThread: vi.fn(),
        activeThreadId: null,
      }),
    )
    expect(el.querySelectorAll('.cs-unit-select.is-selected').length).toBe(2)
    expect(el.querySelectorAll('.cs-unit-selected').length).toBe(2)
    const page1 = el.querySelector('[data-page-ref="p1"]') as HTMLElement
    expect(page1.classList.contains('cs-unit-selected')).toBe(true)
  })
})

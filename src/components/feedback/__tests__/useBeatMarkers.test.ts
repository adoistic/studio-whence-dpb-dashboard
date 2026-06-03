import { describe, it, expect } from 'vitest'
import { indexBeats } from '@/components/feedback/useBeatMarkers'

describe('indexBeats', () => {
  it('maps every data-beat-ref element by its ref', () => {
    const el = document.createElement('div')
    el.innerHTML = '<p class="cs-caption" data-beat-ref="p1.pl1.b1">a</p><p class="cs-dialogue" data-beat-ref="p1.pl1.b2">b</p>'
    const idx = indexBeats(el)
    expect([...idx.keys()]).toEqual(['p1.pl1.b1', 'p1.pl1.b2'])
    expect(idx.get('p1.pl1.b1')?.textContent).toBe('a')
  })
})

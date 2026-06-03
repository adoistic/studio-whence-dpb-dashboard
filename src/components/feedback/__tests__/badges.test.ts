import { describe, it, expect } from 'vitest'
import { assignBadges } from '@/components/feedback/badges'
import type { Thread } from '@/lib/feedbackTypes'

const root = (id: string, anchors: string[]): Thread => ({
  root: { id, comicId: 'c', line: 'l', parentId: null,
    anchors: anchors.map((ref) => ({ kind: 'beat' as const, ref, page: 1, panel: 1, snapshot: '' })),
    authorEmail: '', authorName: '', authorRole: '', body: '', comicVersion: 1, hidden: false, createdAt: 1 },
  replies: [],
})

describe('assignBadges', () => {
  it('numbers only anchored threads, in order, and lists each thread refs', () => {
    const m = assignBadges([root('general', []), root('t1', ['p1.pl1.b1']), root('t2', ['p2.pl1.b1', 'p3.pl1.b1'])])
    expect(m.get('general')).toBeUndefined()
    expect(m.get('t1')).toMatchObject({ num: 1, refs: ['p1.pl1.b1'] })
    expect(m.get('t2')).toMatchObject({ num: 2, refs: ['p2.pl1.b1', 'p3.pl1.b1'] })
  })
})

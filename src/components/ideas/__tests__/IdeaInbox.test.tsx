import { describe, it, expect, vi } from 'vitest'

// IdeaInbox transitively imports @/lib/ideas → @/lib/firebase. Stub the
// firebase-touching modules so importing the file (for the pure helper) does
// not initialize Firebase under jsdom. The grouping assertion is unaffected.
vi.mock('@/lib/ideas', () => ({ markIdeaSeen: vi.fn() }))
vi.mock('@/lib/dataApi', () => ({ resolveUrls: vi.fn(async () => ({})) }))
// IdeaView → IdeaCaptures transitively imports the real @/lib/firebase via its
// live hook — stub the component so the import chain stays firebase-free.
vi.mock('@/components/ideas/IdeaCaptures', () => ({ IdeaCaptures: () => null }))

import { groupByDate } from '@/components/ideas/IdeaInbox'

const mk = (id: string, ms: number) => ({ id, createdAt: { toMillis: () => ms, toDate: () => new Date(ms) } } as any)

describe('groupByDate', () => {
  it('groups ideas by calendar day, newest first', () => {
    const day = 86400000
    const groups = groupByDate([mk('a', day * 3), mk('b', day * 3 + 100), mk('c', day)])
    expect(groups[0].items.map((i: any) => i.id)).toEqual(['b', 'a'])
    expect(groups[1].items.map((i: any) => i.id)).toEqual(['c'])
  })
})

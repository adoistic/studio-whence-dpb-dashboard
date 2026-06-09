import { describe, it, expect, vi } from 'vitest'

// Stub the firebase module so importing ideas.ts (a 'use client' module that
// transitively initializes firebase at load) doesn't require real credentials.
// Same convention as feedback.test.ts — only the pure helper is exercised here.
vi.mock('@/lib/firebase', () => ({ db: {} }))

import { mergeAndSort } from '@/lib/ideas'

const mk = (id: string, ms: number) => ({ id, createdAt: { toMillis: () => ms } } as any)

describe('mergeAndSort', () => {
  it('dedupes by id and sorts newest first', () => {
    const out = mergeAndSort([[mk('a', 1), mk('b', 3)], [mk('a', 1), mk('c', 2)]])
    expect(out.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })
  it('puts null createdAt (pending server write) first', () => {
    const out = mergeAndSort([[mk('a', 1), { id: 'z', createdAt: null } as any]])
    expect(out[0].id).toBe('z')
  })
})

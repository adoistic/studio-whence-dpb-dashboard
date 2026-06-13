/**
 * Tests for the AI-conversations query filter builder (buildConvFilters), used
 * by useAiConversations to attach a live aiConversations listener.
 *
 * firebase/firestore's `where` is mocked so each filter is a recognizable
 * descriptor we can assert on without standing up a real listener.
 */

import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  where: vi.fn((field: string, op: string, value: unknown) => ({ __where: [field, op, value] })),
}))

import { buildConvFilters } from '@/lib/aiConversations'

type WhereDescriptor = { __where: [string, string, unknown] }
const clauses = (filters: unknown[]) => filters.map((f) => (f as WhereDescriptor).__where)

describe('buildConvFilters', () => {
  test('line only → a single attachTo.line clause', () => {
    expect(clauses(buildConvFilters({ line: 'biographies' }))).toEqual([
      ['attachTo.line', '==', 'biographies'],
    ])
  })

  test('comicSlug adds an attachTo.comicSlug clause', () => {
    expect(clauses(buildConvFilters({ line: 'biographies', comicSlug: '01-the-polyester-dream' }))).toEqual([
      ['attachTo.line', '==', 'biographies'],
      ['attachTo.comicSlug', '==', '01-the-polyester-dream'],
    ])
  })

  test('figureSlug adds an attachTo.figureSlug clause alongside the line clause', () => {
    expect(clauses(buildConvFilters({ line: 'medicomics', figureSlug: 'autism' }))).toEqual([
      ['attachTo.line', '==', 'medicomics'],
      ['attachTo.figureSlug', '==', 'autism'],
    ])
  })

  test('comicSlug and figureSlug both apply', () => {
    expect(clauses(buildConvFilters({ line: 'medicomics', comicSlug: '01-x', figureSlug: 'autism' }))).toEqual([
      ['attachTo.line', '==', 'medicomics'],
      ['attachTo.comicSlug', '==', '01-x'],
      ['attachTo.figureSlug', '==', 'autism'],
    ])
  })
})

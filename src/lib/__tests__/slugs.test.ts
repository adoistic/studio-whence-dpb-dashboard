import { describe, test, expect } from 'vitest'
import { normalizeSubjectSlug } from '../slugs'

describe('normalizeSubjectSlug', () => {
  test('lower-cases the slug (the "Gita" casing fix)', () => {
    expect(normalizeSubjectSlug('Gita')).toBe('gita')
    expect(normalizeSubjectSlug('dhirubhai-ambani')).toBe('dhirubhai-ambani')
  })
  test('handles null/empty defensively', () => {
    expect(normalizeSubjectSlug(null)).toBe('')
    expect(normalizeSubjectSlug('')).toBe('')
  })
})

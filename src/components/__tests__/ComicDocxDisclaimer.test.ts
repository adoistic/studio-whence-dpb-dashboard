import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {} }))
import { disclaimerFor } from '@/components/ComicDocxButton'

describe('disclaimerFor', () => {
  it('gives biographies the biography disclosure, not the health line', () => {
    expect(disclaimerFor('biographies')).toMatch(/not an official publication/)
    expect(disclaimerFor('biographies')).not.toMatch(/professional advice/)
  })
  it('keeps the health line for medical and awareness books', () => {
    expect(disclaimerFor('medicomics')).toMatch(/professional advice/)
    expect(disclaimerFor('awareness')).toMatch(/professional advice/)
    expect(disclaimerFor(undefined)).toMatch(/professional advice/)
  })
})

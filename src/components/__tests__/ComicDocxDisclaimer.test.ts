import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {} }))
import { disclaimerFor, readerNoteFor } from '@/components/ComicDocxButton'

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

describe('readerNoteFor', () => {
  // Djokovic SC-09 (Diamond, 7 Oct 2026): the master Word file must carry the book's
  // approved reader note, not the generic line.
  it("prints the book's own approved note when the script carries one", () => {
    const note = 'Some dialogue is dramatized to tell documented events in comic form.'
    expect(readerNoteFor({ line: 'biographies', readerNote: note })).toBe(note)
  })
  it('falls back to the line default', () => {
    expect(readerNoteFor({ line: 'biographies' })).toBe(disclaimerFor('biographies'))
    expect(readerNoteFor({ line: 'biographies', readerNote: '  ' })).toBe(disclaimerFor('biographies'))
  })
})

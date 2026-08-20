import { describe, test, expect } from 'vitest'
import { comicAllowed, type Allocation } from '../allocation'

const doc = {
  comicId: 'biographies__01-the-brand-machine',
  line: 'biographies',
  subject_slug: 'sanjeev-juneja',
  program_slug: 'business-legends',
}
const none: Allocation = { lines: [], figures: [], comics: [], programs: [] }
const member = { email: 'm@dpb.in', moderator: false }
const mod = { email: 'a@thothica.com', moderator: true }

describe('comicAllowed', () => {
  test('a moderator sees everything, allocation or not', () => {
    expect(comicAllowed(doc, mod, null)).toBe(true)
    expect(comicAllowed(doc, mod, none)).toBe(true)
  })

  test('a member with no allocation sees nothing', () => {
    expect(comicAllowed(doc, member, null)).toBe(false)
    expect(comicAllowed(doc, member, none)).toBe(false)
  })

  test('a line grant unlocks the comic', () => {
    expect(comicAllowed(doc, member, { ...none, lines: ['biographies'] })).toBe(true)
  })

  test('a figure grant unlocks the comic', () => {
    expect(comicAllowed(doc, member, { ...none, figures: ['sanjeev-juneja'] })).toBe(true)
  })

  test('a comic grant unlocks exactly that comic, not its siblings', () => {
    expect(comicAllowed(doc, member, { ...none, comics: [doc.comicId] })).toBe(true)
    expect(comicAllowed({ ...doc, comicId: 'biographies__other' },
      member, { ...none, comics: [doc.comicId] })).toBe(false)
  })

  test('a program grant unlocks the comic', () => {
    expect(comicAllowed(doc, member, { ...none, programs: ['business-legends'] })).toBe(true)
  })

  test('a grant for something else does not', () => {
    expect(comicAllowed(doc, member, { ...none, lines: ['indic'], figures: ['ram'] })).toBe(false)
  })

  test('an empty subject or program never matches an empty grant entry', () => {
    const blank = { ...doc, subject_slug: '', program_slug: '' }
    expect(comicAllowed(blank, member, { ...none, figures: [''] })).toBe(false)
    expect(comicAllowed(blank, member, { ...none, programs: [''] })).toBe(false)
  })
})

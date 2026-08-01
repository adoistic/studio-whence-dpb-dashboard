import { describe, test, expect } from 'vitest'
import { programComics, programFigures } from '../programMembership'
import type { Figure, Comic } from '@/types/content'

const fig = (slug: string, program_slug: string, extra: Partial<Figure> = {}): Figure =>
  ({ series: 'Cosmic Beings', slug, program_slug, line: 'indic', sources_count: 3, words: 1000, ...extra })
const comic = (slug: string, subject_slug: string, program_slug: string, extra: Partial<Comic> = {}): Comic =>
  ({ title: slug, slug, subject_slug, program_slug, line: 'indic', status: 'draft', ...extra } as Comic)

// The live shape this was written for: Shiva + Ganesha are native to Cosmic
// Beings; Krishna's primary home is the Mahabharata and he is cross-listed in.
const SHIVA = fig('shiva', 'cosmic-beings')
const GANESHA = fig('ganesha', 'cosmic-beings')
const KRISHNA = fig('krishna', 'mahabharata', { series: 'Mahābhārata', also_programs: ['cosmic-beings'] })
const FIGURES = [SHIVA, GANESHA, KRISHNA]

const SHIVA_COMIC = comic('01-shiva-the-one-who-says-yes', 'shiva', 'cosmic-beings')
const GANESHA_COMIC = comic('01-the-eight-things-he-came-to-fight', 'ganesha', 'cosmic-beings')
const KRISHNA_COMIC = comic('01-the-one-they-all-love', 'krishna', 'mahabharata')
const COMICS = [SHIVA_COMIC, GANESHA_COMIC, KRISHNA_COMIC]

describe('programFigures', () => {
  test('includes a cross-listed being alongside the native ones', () => {
    expect(programFigures(FIGURES, 'indic', 'cosmic-beings').map((f) => f.slug))
      .toEqual(['shiva', 'ganesha', 'krishna'])
  })
  test('the cross-listed being still belongs to their primary program', () => {
    expect(programFigures(FIGURES, 'indic', 'mahabharata').map((f) => f.slug)).toEqual(['krishna'])
  })
  test('a figure of another line never leaks in on a slug collision', () => {
    const other = fig('krishna', 'cosmic-beings', { line: 'biographies' })
    expect(programFigures([other], 'indic', 'cosmic-beings')).toEqual([])
  })
})

describe('programComics', () => {
  test("a cross-listed being's comic appears in the program that cross-lists them", () => {
    expect(programComics(COMICS, FIGURES, 'indic', 'cosmic-beings').map((c) => c.slug))
      .toEqual([SHIVA_COMIC.slug, GANESHA_COMIC.slug, KRISHNA_COMIC.slug])
  })
  test('and still appears in its own program', () => {
    expect(programComics(COMICS, FIGURES, 'indic', 'mahabharata').map((c) => c.slug))
      .toEqual([KRISHNA_COMIC.slug])
  })
  test('subject matching is case-insensitive (title-cased subject folders)', () => {
    const gita = fig('gita', 'mahabharata', { also_programs: ['cosmic-beings'] })
    const c = comic('c1', 'Gita', 'mahabharata')
    expect(programComics([c], [gita], 'indic', 'cosmic-beings')).toEqual([c])
  })
  test('no cross-listing → only the program’s own comics', () => {
    expect(programComics(COMICS, [SHIVA, GANESHA], 'indic', 'cosmic-beings').map((c) => c.slug))
      .toEqual([SHIVA_COMIC.slug, GANESHA_COMIC.slug])
  })
  test('a figure absent from the gated list contributes nothing — gating is never widened', () => {
    // Krishna unreadable by this viewer → his comic must not surface via cross-listing.
    expect(programComics([KRISHNA_COMIC], [SHIVA], 'indic', 'cosmic-beings')).toEqual([])
  })
})

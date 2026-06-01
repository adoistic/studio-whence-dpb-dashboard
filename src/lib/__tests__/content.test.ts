import { loadContent, findLine, findComic, requireLine } from '../content'
import type { Content } from '@/types/content'

// findComic/findLine logic is tested against an inline fixture rather than the
// bundled content.json — the public bundle is now a data-less skeleton (real
// data is served gated at runtime), so loader tests must not depend on it.
const fixture: Content = {
  generated_at: '2026-06-01T00:00:00Z',
  source_sha: 'test',
  headline: { figures_researched: 0, comics_in_production: 1, lines_active: 4 },
  lines: [
    {
      slug: 'biographies',
      title: 'Biographies',
      subtitle: 'Little Chanakya Presents…',
      comics: [
        {
          title: 'The Man Who Built Trust',
          slug: '01-the-man-who-built-trust',
          subject_slug: 'ratan-tata',
          subject: 'Ratan Tata',
          line: 'biographies',
          status: 'draft',
        },
      ],
      figures: [],
    },
    { slug: 'awareness', title: 'Awareness', subtitle: '', comics: [], figures: [] },
    { slug: 'indic', title: 'Indic', subtitle: '', comics: [], figures: [] },
    { slug: 'toddlers', title: 'Toddlers', subtitle: '', comics: [], figures: [] },
  ],
  activity: [],
  images: [],
}

test('loadContent returns parsed content.json with the four lines', () => {
  const c = loadContent()
  expect(c.lines.length).toBe(4)
  expect(c.lines.map((l) => l.slug)).toEqual(
    expect.arrayContaining(['biographies', 'awareness', 'indic', 'toddlers'])
  )
})

test('findLine returns the matching line', () => {
  const line = findLine('biographies', fixture)
  expect(line).toBeDefined()
  expect(line?.slug).toBe('biographies')
})

test('findComic finds a known comic slug', () => {
  const comic = findComic('biographies', '01-the-man-who-built-trust', fixture)
  expect(comic).toBeDefined()
  expect(comic?.subject).toBe('Ratan Tata')
})

test('findComic returns undefined for a missing slug', () => {
  const c = loadContent()
  const comic = findComic('biographies', 'no-such-comic', c)
  expect(comic).toBeUndefined()
})

test('findComic returns undefined when line is valid but comic slug is absent', () => {
  const c = loadContent()
  const comic = findComic('biographies', 'no-such-comic-slug', c)
  expect(comic).toBeUndefined()
})

test('requireLine returns the biographies line', () => {
  const c = loadContent()
  const line = requireLine('biographies', c)
  expect(line).toBeDefined()
  expect(line.slug).toBe('biographies')
})

test('requireLine throws for a missing slug', () => {
  const c = loadContent()
  expect(() => requireLine('nonexistent' as any, c)).toThrow(
    'Line "nonexistent" missing from content.json'
  )
})

import { loadContent, findLine, findComic, requireLine } from '../content'

test('loadContent returns parsed content.json', () => {
  const c = loadContent()
  expect(c.lines.length).toBe(4)
  expect(c.lines.map((l) => l.slug)).toEqual(
    expect.arrayContaining(['biographies', 'awareness', 'indic', 'toddlers'])
  )
})

test('findLine returns the biographies line', () => {
  const c = loadContent()
  const line = findLine('biographies', c)
  expect(line).toBeDefined()
  expect(line?.slug).toBe('biographies')
  expect(line?.comics.length).toBeGreaterThan(0)
})

test('findComic finds a known comic slug', () => {
  const c = loadContent()
  const comic = findComic('biographies', '01-the-man-who-built-trust', c)
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

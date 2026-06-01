import { loadContent, findLine, findComic } from '../content'

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

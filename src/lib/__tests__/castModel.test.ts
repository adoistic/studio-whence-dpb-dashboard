/**
 * castModel — folding per-comic casts into one view.
 *
 * Every Characters view above a single comic is this union, so its rules are the
 * view's rules: identity is (line, id); shared IP merges into one entry; a page is
 * only ever a page of ONE book; a library sheet joins a programme only when it is
 * tagged with it; and a placeholder never sits beside real versions.
 */
import { describe, expect, test } from 'vitest'
import {
  castTotals,
  drawnVersions,
  filterCharacters,
  linesOf,
  mergeCasts,
  type CastDoc,
  type CastPerson,
} from '@/lib/castModel'

function doc(comicId: string, people: CastPerson[], extra: Partial<CastDoc> = {}): CastDoc {
  const [line, slug] = comicId.split('__')
  return {
    comicId, line, slug, title: slug, subject_slug: '', program_slug: '', library: false, source: 't',
    counts: { characters: 0, named: 0, generalized: 0, shared: 0, drawn: 0, undrawn: 0, versions: 0, versionsDrawn: 0 },
    people, ...extra,
  }
}

const v = (stage: string, drawn: boolean, pages: number[] = [], extra = {}) => ({
  stage, label: stage, drawn, pages,
  ...(drawn ? { key: `k/${stage}.png`, thumb: `t/${stage}.jpg`, bytes: 100 } : {}),
  ...extra,
})

describe('mergeCasts', () => {
  test('one character staged by two books is one entry naming both, pages kept per book', () => {
    const out = mergeCasts([
      doc('indic__a', [{ id: 'rama', line: 'indic', name: 'Rama', kind: 'named', pages: [1, 2], spoken: 5, versions: [v('rama', true, [1, 2])] }]),
      doc('indic__b', [{ id: 'rama', line: 'indic', name: 'Rama', kind: 'named', pages: [2], spoken: 3, versions: [v('rama', true, [2]), v('rama-war', false, [9])] }]),
    ])
    expect(out).toHaveLength(1)
    const rama = out[0]
    expect(rama.comics.map((c) => c.comicId)).toEqual(['indic__a', 'indic__b'])
    expect(rama.appearances).toBe(3) // page 2 of book a and page 2 of book b are two pages
    expect(rama.spoken).toBe(8)
    const main = rama.versions.find((x) => x.stage === 'rama')!
    expect(main.comics.map((c) => [c.comicId, c.pages])).toEqual([['indic__a', [1, 2]], ['indic__b', [2]]])
    expect(rama.status).toBe('partial')
  })

  test('the same id in two lines is two characters', () => {
    const out = mergeCasts([
      doc('indic__a', [{ id: 'rama', line: 'indic', name: 'Rama', kind: 'named', pages: [], versions: [v('a', true)] }]),
      doc('manga-indic__b', [{ id: 'rama', line: 'manga-indic', name: 'Rama', kind: 'named', pages: [], versions: [v('b', true)] }]),
    ])
    expect(out.map((c) => c.uid).sort()).toEqual(['indic/rama', 'manga-indic/rama'])
  })

  test('shared IP merges across lines into one entry', () => {
    const lc = (pages: number[]): CastPerson => ({ id: 'little-chanakya', line: 'shared', name: 'Little Chanakya', kind: 'shared', pages, versions: [v('base', true, pages)] })
    const out = mergeCasts([doc('awareness__a', [lc([1])]), doc('biographies__b', [lc([4])])])
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('shared')
    expect(linesOf(out)).toEqual(['awareness', 'biographies'])
  })

  test('a library sheet joins a programme only when tagged with it, and is marked unstaged', () => {
    const lib = doc('manga-indic__library', [
      { id: 'rama', line: 'manga-indic', name: 'Rama', kind: 'named', pages: [], programs: ['manga-indic'], versions: [v('rama-crowned', true)] },
      { id: 'brides', line: 'manga-indic', name: 'Brides', kind: 'generalized', pages: [], programs: ['other'], versions: [v('brides', true)] },
    ], { library: true })
    const book = doc('manga-indic__v1', [{ id: 'rama', line: 'manga-indic', name: 'Rama', kind: 'named', pages: [3], versions: [v('rama-court', true, [3])] }])
    const out = mergeCasts([book, lib], { program: 'manga-indic' })
    expect(out.map((c) => c.id)).toEqual(['rama'])
    const crowned = out[0].versions.find((x) => x.stage === 'rama-crowned')!
    expect(crowned.unstaged).toBe(true)
    expect(out[0].comics.map((c) => c.comicId)).toEqual(['manga-indic__v1'])
    // With no programme (the studio-wide view) every library entry is kept.
    expect(mergeCasts([book, lib]).map((c) => c.id).sort()).toEqual(['brides', 'rama'])
  })

  test('a placeholder is dropped once a real version is known', () => {
    const out = mergeCasts([
      doc('x__a', [{ id: 'p', line: 'x', name: 'P', kind: 'named', pages: [], versions: [v('—', false)] }]),
      doc('x__b', [{ id: 'p', line: 'x', name: 'P', kind: 'named', pages: [], versions: [v('base', true)] }]),
    ])
    expect(out[0].versions.map((x) => x.stage)).toEqual(['base'])
    expect(out[0].status).toBe('drawn')
  })

  test('text-only stock extras are their own status, never owed art', () => {
    const out = mergeCasts([doc('x__a', [{ id: 's', line: 'x', name: 'Stock sage', kind: 'generalized', pages: [], versions: [v('sage', false, [], { text: true })] }])])
    expect(out[0].status).toBe('text')
    expect(castTotals(out).versionsOwed).toBe(0)
  })

  test('named before shared before generalised, then by appearances', () => {
    const out = mergeCasts([doc('x__a', [
      { id: 'crowd', line: 'x', name: 'Crowd', kind: 'generalized', pages: [1, 2, 3, 4], versions: [v('c', true, [1, 2, 3, 4])] },
      { id: 'minor', line: 'x', name: 'Minor', kind: 'named', pages: [1], versions: [v('m', true, [1])] },
      { id: 'lead', line: 'x', name: 'Lead', kind: 'named', pages: [1, 2], versions: [v('l', true, [1, 2])] },
      { id: 'lc', line: 'shared', name: 'LC', kind: 'shared', pages: [1, 2, 3], versions: [v('b', true, [1, 2, 3])] },
    ])])
    expect(out.map((c) => c.id)).toEqual(['lead', 'minor', 'lc', 'crowd'])
  })
})

describe('filters and totals', () => {
  const all = mergeCasts([doc('x__a', [
    { id: 'drawn', line: 'x', name: 'Drawn One', kind: 'named', pages: [1], versions: [v('a', true, [1])] },
    { id: 'part', line: 'x', name: 'Partly', kind: 'named', pages: [1], versions: [v('a', true, [1]), v('b', false, [2])] },
    { id: 'none', line: 'x', name: 'Nobody Yet', kind: 'named', pages: [3], versions: [v('—', false, [3])] },
    { id: 'gen', line: 'x', name: 'A Soldier', kind: 'generalized', pages: [4], versions: [v('s', true, [4])] },
  ])])

  test('drawn includes partly drawn; not drawn yet includes anything still owed', () => {
    expect(filterCharacters(all, { filter: 'drawn' }).map((c) => c.id).sort()).toEqual(['drawn', 'gen', 'part'])
    expect(filterCharacters(all, { filter: 'undrawn' }).map((c) => c.id).sort()).toEqual(['none', 'part'])
    expect(filterCharacters(all, { filter: 'generalized' }).map((c) => c.id)).toEqual(['gen'])
    expect(filterCharacters(all, { q: 'nobody' }).map((c) => c.id)).toEqual(['none'])
  })

  test('totals count versions drawn, owed and their bytes', () => {
    const t = castTotals(all)
    expect(t).toMatchObject({ characters: 4, drawn: 3, undrawn: 2, generalized: 1, versions: 5, versionsDrawn: 3, versionsOwed: 2, bytesDrawn: 300 })
    expect(drawnVersions(all)).toHaveLength(3)
  })
})

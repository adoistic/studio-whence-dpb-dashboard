import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// ─── Mocks for firebase-admin/firestore ────────────────────────────────────
//
// `getFirestore().collection(name).doc(id).get()` is routed per collection:
//   `allocations` → allocGet, `figures` → figureGet, `castIndex` →
//   castIndexGet(id) (so a test can see WHICH line was read), everything
//   else → comicGet.
// Each defaults to {exists:false} so absent docs are the baseline.

const allocGet = vi.fn()
const comicGet = vi.fn()
const figureGet = vi.fn()
const castIndexGet = vi.fn()

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        get:
          name === 'allocations'
            ? allocGet
            : name === 'figures'
              ? figureGet
              : name === 'castIndex'
                ? () => castIndexGet(id)
                : comicGet,
      })),
    })),
  })),
}))

import {
  scopeOfKey,
  getAllocation,
  comicMeta,
  figureProgram,
  castIndex,
  clearCastIndexCache,
  isKeyAllowedForMember,
  type Allocation,
  type AllocationDeps,
  type CastIndex,
} from '../allocation'

beforeEach(() => {
  allocGet.mockReset()
  comicGet.mockReset()
  figureGet.mockReset()
  castIndexGet.mockReset()
  allocGet.mockResolvedValue({ exists: false, data: () => ({}) })
  comicGet.mockResolvedValue({ exists: false, data: () => ({}) })
  figureGet.mockResolvedValue({ exists: false, data: () => ({}) })
  castIndexGet.mockResolvedValue({ exists: false, data: () => ({}) })
  // The cast index is cached in module memory; every test starts cold.
  clearCastIndexCache()
})

// ─── scopeOfKey — pure parser (table test) ───────────────────────────────────

describe('scopeOfKey', () => {
  const cases: Array<{
    name: string
    key: string
    expected: ReturnType<typeof scopeOfKey>
  }> = [
    {
      name: 'draft → comicId + line',
      key: 'drafts/biographies/01-the-polyester-dream.html',
      expected: {
        line: 'biographies',
        comicId: 'biographies__01-the-polyester-dream',
      },
    },
    {
      name: 'biographies research → line + subject (after _books)',
      key: 'research/biographies/01-Business-Legends/_books/dhirubhai-ambani/polyester-prince/chapters/04.md',
      expected: { line: 'biographies', subject: 'dhirubhai-ambani' },
    },
    {
      name: 'indic research (characters) → line + subject (after characters)',
      key: 'research/indic/Ramayana/characters/rama/notes.md',
      expected: { line: 'indic', subject: 'rama' },
    },
    {
      name: 'indic core research → line only (no subject)',
      key: 'research/indic/Ramayana/core/source.md',
      expected: { line: 'indic' },
    },
    {
      name: 'Practical Indic research → line normalised to indic + subject',
      key: 'research/Indic/Practical-Indic/swami-ramdev/mera-jeevan-mera-mission/chapters/09-4.md',
      expected: { line: 'indic', subject: 'swami-ramdev' },
    },
    {
      name: 'image under _books → line + subject',
      key: 'images/biographies/03-Cricket-Legends/_books/sachin-tendulkar/refs/face.png',
      expected: { line: 'biographies', subject: 'sachin-tendulkar' },
    },
    {
      name: 'artifact under _comics → subject before _comics',
      key: 'artifacts/biographies/_books/sachin-tendulkar/_comics/01-the-debut/page01.png',
      expected: { line: 'biographies', subject: 'sachin-tendulkar' },
    },
    {
      name: 'image nested draft shape → comicId + line',
      key: 'images/drafts/biographies/01-the-polyester-dream/cover.png',
      expected: {
        line: 'biographies',
        comicId: 'biographies__01-the-polyester-dream',
      },
    },
    {
      name: 'unattributable image (no markers) → {}',
      key: 'images/brand/logo.png',
      expected: {},
    },
    {
      name: 'empty string → {}',
      key: '',
      expected: {},
    },
    {
      name: 'top-level only → {}',
      key: 'research/',
      expected: {},
    },
    {
      name: 'docs methodology → { methodology: true }',
      key: 'docs/methodology/diamond-books.read.md',
      expected: { methodology: true },
    },
    {
      name: 'docs/comics → line + subject + comicId (subject in-path)',
      key: 'docs/comics/biographies/sam-altman/01-the-optimist/bundle.md',
      expected: {
        line: 'biographies',
        subject: 'sam-altman',
        comicId: 'biographies__01-the-optimist',
      },
    },
    {
      name: 'docs research → { methodology: true } (any-member tier)',
      key: 'docs/research/medicomics/autism/README.md',
      expected: { methodology: true },
    },
    {
      name: 'sites/medikidz → { methodology: true } (any-member tier)',
      key: 'sites/medikidz/index.html',
      expected: { methodology: true },
    },
    {
      name: 'docs/research with no line → {} (deny)',
      key: 'docs/research/',
      expected: {},
    },
    {
      name: 'docs/whatever (unrecognized) → {}',
      key: 'docs/whatever',
      expected: {},
    },
    {
      name: 'images/comics cover → { line, comicId }',
      key: 'images/comics/biographies/01-the-comic/cover.jpg',
      expected: {
        line: 'biographies',
        comicId: 'biographies__01-the-comic',
      },
    },
    {
      name: 'images/comics page → { line, comicId }',
      key: 'images/comics/biographies/01-the-comic/pages/page-03.jpg',
      expected: {
        line: 'biographies',
        comicId: 'biographies__01-the-comic',
      },
    },
    {
      name: 'artifacts/comics cover-ref → { line, comicId }',
      key: 'artifacts/comics/legacy/hanuman-celestial-superpower/cover-refs/ref.png',
      expected: {
        line: 'legacy',
        comicId: 'legacy__hanuman-celestial-superpower',
      },
    },
    {
      name: 'panels/{line}/{slug}.json → comicId + line (same shape as drafts)',
      key: 'panels/biographies/01-betting-on-the-impossible.json',
      expected: {
        line: 'biographies',
        comicId: 'biographies__01-betting-on-the-impossible',
      },
    },
    {
      name: 'panels malformed (missing slug segment) → {} (not a partial scope)',
      key: 'panels/onlyoneseg.json',
      expected: {},
    },

    // ── artifacts/characters/{line}/{id}/… (character sheets) ──
    {
      name: 'character sheet → { line, character }',
      key: 'artifacts/characters/indic/rama/rama-boy.png',
      expected: { line: 'indic', character: 'rama' },
    },
    {
      name: 'character web thumbnail → the same { line, character }',
      key: 'artifacts/characters/indic/rama/web/rama-boy.jpg',
      expected: { line: 'indic', character: 'rama' },
    },
    {
      name: 'shared-IP character sheet → { line: shared, character }',
      key: 'artifacts/characters/shared/little-chanakya/base.png',
      expected: { line: 'shared', character: 'little-chanakya' },
    },
    {
      name: 'character key with only a line → {} (deny)',
      key: 'artifacts/characters/indic',
      expected: {},
    },
    {
      name: 'character key with a line and id but no file → {} (deny)',
      key: 'artifacts/characters/indic/rama',
      expected: {},
    },
    {
      name: 'character key with a trailing slash and no file → {} (deny)',
      key: 'artifacts/characters/indic/rama/',
      expected: {},
    },
    {
      name: 'bare artifacts/characters → {} (deny)',
      key: 'artifacts/characters',
      expected: {},
    },
    {
      name: 'character key with an empty line segment → {} (segments collapse, no line)',
      key: 'artifacts/characters//rama/rama-boy.png',
      expected: {},
    },
    {
      name: 'a nested `characters/` marker under artifacts keeps the generic parse',
      key: 'artifacts/indic/Ramayana/characters/rama/ref.png',
      expected: { line: 'indic', subject: 'rama' },
    },
    {
      name: 'images/characters/… is untouched (only artifacts/characters changed)',
      key: 'images/characters/indic/rama/rama-boy.png',
      expected: { line: 'characters', subject: 'indic' },
    },

    // ── bundles/research/{line}/{figure}/… (research downloads) ──
    {
      name: 'research bundle, whole figure → research scope { line, subject }',
      key: 'bundles/research/biographies/steve-jobs/all.zip',
      expected: { line: 'biographies', subject: 'steve-jobs' },
    },
    {
      name: 'research bundle, one source as Markdown → research scope',
      key: 'bundles/research/biographies/steve-jobs/sources/x.md',
      expected: { line: 'biographies', subject: 'steve-jobs' },
    },
    {
      name: 'research bundle, one source as a zip → research scope',
      key: 'bundles/research/biographies/steve-jobs/sources/x.zip',
      expected: { line: 'biographies', subject: 'steve-jobs' },
    },
    {
      name: 'another bundle kind → {} (deny)',
      key: 'bundles/other/x',
      expected: {},
    },
    {
      name: 'research bundle with only a line → {} (deny)',
      key: 'bundles/research/biographies',
      expected: {},
    },
    {
      name: 'research bundle with a figure but no file → {} (deny)',
      key: 'bundles/research/biographies/steve-jobs',
      expected: {},
    },
    {
      name: 'the bundle bookkeeping file → {} (deny)',
      key: 'bundles/research/_state.json',
      expected: {},
    },
    {
      name: 'bare bundles/ → {} (deny)',
      key: 'bundles/',
      expected: {},
    },
    {
      name: 'a bundle shape that only LOOKS like research markers → {} (deny)',
      key: 'bundles/x/biographies/_books/steve-jobs/a.md',
      expected: {},
    },
  ]

  for (const c of cases) {
    test(c.name, () => {
      expect(scopeOfKey(c.key)).toEqual(c.expected)
    })
  }
})

// ─── getAllocation ───────────────────────────────────────────────────────────

describe('getAllocation', () => {
  test('absent doc → null', async () => {
    allocGet.mockResolvedValue({ exists: false })
    expect(await getAllocation('m@x.com')).toBeNull()
  })

  test('present doc → arrays, missing fields default to []', async () => {
    allocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        lines: ['biographies'],
        figures: ['sachin-tendulkar'],
        figures_effective: ['sachin-tendulkar', 'dhirubhai-ambani'],
        comics: ['biographies__a'],
        programs: ['cricket-legends'],
      }),
    })
    expect(await getAllocation('m@x.com')).toEqual({
      lines: ['biographies'],
      figures: ['sachin-tendulkar'],
      figures_effective: ['sachin-tendulkar', 'dhirubhai-ambani'],
      comics: ['biographies__a'],
      programs: ['cricket-legends'],
    })
  })

  test('missing figures / figures_effective / programs default to []', async () => {
    allocGet.mockResolvedValue({
      exists: true,
      data: () => ({ lines: ['biographies'], comics: ['biographies__a'] }),
    })
    expect(await getAllocation('m@x.com')).toEqual({
      lines: ['biographies'],
      figures: [],
      figures_effective: [],
      comics: ['biographies__a'],
      programs: [],
    })
  })

  test('non-array fields are coerced to []', async () => {
    allocGet.mockResolvedValue({
      exists: true,
      data: () => ({ lines: 'oops', figures: {}, figures_effective: null, comics: 5, programs: 'nope' }),
    })
    expect(await getAllocation('m@x.com')).toEqual({
      lines: [],
      figures: [],
      figures_effective: [],
      comics: [],
      programs: [],
    })
  })
})

// ─── comicMeta ───────────────────────────────────────────────────────────────

describe('comicMeta', () => {
  test('present → subject_slug + program_slug in one read', async () => {
    comicGet.mockResolvedValue({
      exists: true,
      data: () => ({ subject_slug: 'dhirubhai-ambani', program_slug: 'business-legends' }),
    })
    expect(await comicMeta('biographies__01')).toEqual({
      subject: 'dhirubhai-ambani',
      program: 'business-legends',
    })
  })

  test('null / missing fields → null (the publish pipeline writes explicit nulls)', async () => {
    comicGet.mockResolvedValue({
      exists: true,
      data: () => ({ subject_slug: 'tingaland', program_slug: null }),
    })
    expect(await comicMeta('tingaland__01')).toEqual({ subject: 'tingaland', program: null })
  })

  test('absent doc → both null', async () => {
    comicGet.mockResolvedValue({ exists: false })
    expect(await comicMeta('biographies__01')).toEqual({ subject: null, program: null })
  })
})

// ─── figureProgram ───────────────────────────────────────────────────────────

describe('figureProgram', () => {
  test('present → program_slug', async () => {
    figureGet.mockResolvedValue({
      exists: true,
      data: () => ({ program_slug: 'cricket-legends' }),
    })
    expect(await figureProgram('kapil-dev')).toBe('cricket-legends')
  })

  test('absent doc / missing field → null', async () => {
    figureGet.mockResolvedValue({ exists: false })
    expect(await figureProgram('kapil-dev')).toBeNull()
    figureGet.mockResolvedValue({ exists: true, data: () => ({}) })
    expect(await figureProgram('kapil-dev')).toBeNull()
  })
})

// ─── castIndex (default reader: castIndex/{line}, cached per instance) ───────

describe('castIndex', () => {
  const INDEX = {
    comics: { 'indic__01-bala': { s: 'rama', p: 'ramayana' } },
    chars: { rama: ['indic__01-bala'] },
  }
  const found = (data: unknown = INDEX) => ({ exists: true, data: () => data })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('present doc → { comics, chars }, read from castIndex/{line}', async () => {
    castIndexGet.mockResolvedValue(found())
    expect(await castIndex('indic')).toEqual(INDEX)
    expect(castIndexGet).toHaveBeenCalledWith('indic')
  })

  test('absent doc → null', async () => {
    expect(await castIndex('indic')).toBeNull()
  })

  test('non-object comics / chars are coerced to {}', async () => {
    castIndexGet.mockResolvedValue(found({ comics: 'oops', chars: ['rama'] }))
    expect(await castIndex('indic')).toEqual({ comics: {}, chars: {} })
    clearCastIndexCache()
    castIndexGet.mockResolvedValue(found({}))
    expect(await castIndex('indic')).toEqual({ comics: {}, chars: {} })
  })

  test('a found index is reused for 5 minutes, then read again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T00:00:00Z'))
    castIndexGet.mockResolvedValue(found())
    await castIndex('indic')
    vi.setSystemTime(new Date('2026-10-19T00:04:59Z'))
    await castIndex('indic')
    expect(castIndexGet).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-10-19T00:05:01Z'))
    await castIndex('indic')
    expect(castIndexGet).toHaveBeenCalledTimes(2)
  })

  test('an absent index is remembered for 1 minute, then read again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T00:00:00Z'))
    expect(await castIndex('indic')).toBeNull()
    vi.setSystemTime(new Date('2026-10-19T00:00:59Z'))
    expect(await castIndex('indic')).toBeNull()
    expect(castIndexGet).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-10-19T00:01:01Z'))
    castIndexGet.mockResolvedValue(found())
    expect(await castIndex('indic')).toEqual(INDEX)
    expect(castIndexGet).toHaveBeenCalledTimes(2)
  })

  test('each line is cached on its own', async () => {
    castIndexGet.mockResolvedValue(found())
    await castIndex('indic')
    await castIndex('manga')
    await castIndex('indic')
    expect(castIndexGet).toHaveBeenCalledTimes(2)
    expect(castIndexGet).toHaveBeenNthCalledWith(1, 'indic')
    expect(castIndexGet).toHaveBeenNthCalledWith(2, 'manga')
  })

  test('50 concurrent callers (one /resolve batch) share ONE read', async () => {
    castIndexGet.mockResolvedValue(found())
    const all = await Promise.all(Array.from({ length: 50 }, () => castIndex('indic')))
    expect(castIndexGet).toHaveBeenCalledTimes(1)
    expect(all.every((i) => i !== null && i.chars.rama[0] === 'indic__01-bala')).toBe(true)
  })

  test('a read that throws rejects, is NOT cached, and the next call retries', async () => {
    castIndexGet.mockRejectedValueOnce(new Error('firestore down'))
    await expect(castIndex('indic')).rejects.toThrow(/firestore down/)
    castIndexGet.mockResolvedValue(found())
    expect(await castIndex('indic')).toEqual(INDEX)
    expect(castIndexGet).toHaveBeenCalledTimes(2)
  })

  test('an implausible doc id is never read → null', async () => {
    for (const line of ['', '.', '__proto__', '__x__', 'a b', 'x'.repeat(101), '-lead']) {
      expect(await castIndex(line)).toBeNull()
    }
    expect(castIndexGet).not.toHaveBeenCalled()
  })

  test('a long stream of made-up lines cannot grow the cache without bound', async () => {
    castIndexGet.mockResolvedValue(found())
    for (let i = 0; i < 200; i++) await castIndex(`made-up-${i}`)
    expect(castIndexGet).toHaveBeenCalledTimes(200)
    // The most recent line is still cached …
    await castIndex('made-up-199')
    expect(castIndexGet).toHaveBeenCalledTimes(200)
    // … the earliest was evicted and is read again.
    await castIndex('made-up-0')
    expect(castIndexGet).toHaveBeenCalledTimes(201)
  })
})

// ─── isKeyAllowedForMember ───────────────────────────────────────────────────

describe('isKeyAllowedForMember', () => {
  const alloc = (over: Partial<Allocation> = {}): Allocation => ({
    lines: [],
    figures: [],
    figures_effective: [],
    comics: [],
    programs: [],
    ...over,
  })
  // Injectable deps with fail-closed defaults; override per test.
  const mkDeps = (over: Partial<AllocationDeps> = {}): AllocationDeps => ({
    comicMeta: vi.fn(async () => ({ subject: null, program: null })),
    figureProgram: vi.fn(async () => null),
    castIndex: vi.fn(async () => null),
    ...over,
  })

  test('null allocation → deny', async () => {
    const ok = await isKeyAllowedForMember(
      'research/biographies/x/_books/sachin-tendulkar/a.md',
      null
    )
    expect(ok).toBe(false)
  })

  test('unattributable key → deny', async () => {
    const ok = await isKeyAllowedForMember(
      'images/brand/logo.png',
      alloc({ lines: ['biographies'] })
    )
    expect(ok).toBe(false)
  })

  test('line grant allows a research key on that line', async () => {
    const ok = await isKeyAllowedForMember(
      'research/biographies/01/_books/sachin-tendulkar/a.md',
      alloc({ lines: ['biographies'] })
    )
    expect(ok).toBe(true)
  })

  test('figure grant allows a research key for that subject', async () => {
    const ok = await isKeyAllowedForMember(
      'research/biographies/01/_books/sachin-tendulkar/a.md',
      alloc({ figures_effective: ['sachin-tendulkar'] })
    )
    expect(ok).toBe(true)
  })

  test('no matching grant → deny (different subject)', async () => {
    const ok = await isKeyAllowedForMember(
      'research/biographies/01/_books/sachin-tendulkar/a.md',
      alloc({ figures_effective: ['virat-kohli'] })
    )
    expect(ok).toBe(false)
  })

  test('comic grant allows a draft key', async () => {
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/01-the-debut.html',
      alloc({ comics: ['biographies__01-the-debut'] })
    )
    expect(ok).toBe(true)
  })

  test('comic grant allows the equivalent panels key (same comicId as its draft)', async () => {
    const ok = await isKeyAllowedForMember(
      'panels/biographies/01-the-debut.json',
      alloc({ comics: ['biographies__01-the-debut'] })
    )
    expect(ok).toBe(true)
  })

  test('panels key: member without the grant is denied', async () => {
    const ok = await isKeyAllowedForMember(
      'panels/biographies/01-the-debut.json',
      alloc({ comics: ['biographies__02-someone-else'] })
    )
    expect(ok).toBe(false)
  })

  test('draft key: RAW figure grant matched via comic-doc subject lookup', async () => {
    const deps = mkDeps({
      comicMeta: vi.fn(async () => ({ subject: 'sachin-tendulkar', program: null })),
    })
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/01-the-debut.html',
      alloc({ figures: ['sachin-tendulkar'] }),
      deps
    )
    expect(ok).toBe(true)
    expect(deps.comicMeta).toHaveBeenCalledWith('biographies__01-the-debut')
  })

  test('draft key: figures_effective does NOT grant the comic (sibling-comic leak)', async () => {
    // A single-comic grant adds the subject to figures_effective. That must NOT
    // unlock the figure's OTHER (sibling) comics — only the comic-id grant or a
    // RAW figure grant may. Here the member was granted a sibling comic (so the
    // subject is in figures_effective) but NOT this comic and NOT the raw figure.
    const deps = mkDeps({
      comicMeta: vi.fn(async () => ({ subject: 'sachin-tendulkar', program: null })),
    })
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/02-the-sibling.html',
      alloc({ comics: ['biographies__01-the-debut'], figures_effective: ['sachin-tendulkar'] }),
      deps
    )
    expect(ok).toBe(false)
  })

  test('draft key: no comic-doc lookup when a line grant already allows', async () => {
    const deps = mkDeps()
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/01-the-debut.html',
      alloc({ lines: ['biographies'] }),
      deps
    )
    expect(ok).toBe(true)
    expect(deps.comicMeta).not.toHaveBeenCalled()
  })

  test('draft key: no comic-doc lookup when RAW figures AND programs are empty', async () => {
    // figures_effective is non-empty but figures + programs are empty → the
    // comic branch never reads the comic doc (it would only test those grants).
    const deps = mkDeps()
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/02-the-sibling.html',
      alloc({ figures_effective: ['sachin-tendulkar'] }),
      deps
    )
    expect(ok).toBe(false)
    expect(deps.comicMeta).not.toHaveBeenCalled()
  })

  test('draft key: subject lookup misses → deny', async () => {
    const deps = mkDeps({
      comicMeta: vi.fn(async () => ({ subject: 'someone-else', program: null })),
    })
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/01-the-debut.html',
      alloc({ figures: ['sachin-tendulkar'] }),
      deps
    )
    expect(ok).toBe(false)
  })

  // ── Program (whole-series) grants — the gap that broke program members ──

  test('draft key: PROGRAM grant matched via comic-doc program lookup', async () => {
    const deps = mkDeps({
      comicMeta: vi.fn(async () => ({ subject: 'virat-kohli', program: 'cricket-legends' })),
    })
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/01-the-delhi-boy-who-became-king.html',
      alloc({ programs: ['cricket-legends'] }),
      deps
    )
    expect(ok).toBe(true)
    expect(deps.comicMeta).toHaveBeenCalledWith('biographies__01-the-delhi-boy-who-became-king')
  })

  test('draft key: program mismatch (or null program_slug) → deny', async () => {
    const deps = mkDeps({
      comicMeta: vi.fn(async () => ({ subject: 'tingaland', program: null })),
    })
    const ok = await isKeyAllowedForMember(
      'drafts/tingaland/01-tingaland-rhymes.html',
      alloc({ programs: ['cricket-legends'] }),
      deps
    )
    expect(ok).toBe(false)
  })

  test('page-image key: PROGRAM grant allows via the same comic-doc lookup', async () => {
    const deps = mkDeps({
      comicMeta: vi.fn(async () => ({ subject: 'virat-kohli', program: 'cricket-legends' })),
    })
    const ok = await isKeyAllowedForMember(
      'images/comics/biographies/01-the-delhi-boy-who-became-king/pages/page-01.jpg',
      alloc({ programs: ['cricket-legends'] }),
      deps
    )
    expect(ok).toBe(true)
  })

  test('research key: PROGRAM grant unlocks the figure’s research (figure-doc lookup)', async () => {
    const deps = mkDeps({ figureProgram: vi.fn(async () => 'cricket-legends') })
    const ok = await isKeyAllowedForMember(
      'research/biographies/03-Cricket-Legends/_books/virat-kohli/notes.md',
      alloc({ programs: ['cricket-legends'] }),
      deps
    )
    expect(ok).toBe(true)
    expect(deps.figureProgram).toHaveBeenCalledWith('virat-kohli')
  })

  test('research key: figure outside the granted program → deny', async () => {
    const deps = mkDeps({ figureProgram: vi.fn(async () => 'business-legends') })
    const ok = await isKeyAllowedForMember(
      'research/biographies/01-Business-Legends/_books/ratan-tata/notes.md',
      alloc({ programs: ['cricket-legends'] }),
      deps
    )
    expect(ok).toBe(false)
  })

  test('research key: no figure-doc lookup when programs is empty', async () => {
    const deps = mkDeps()
    const ok = await isKeyAllowedForMember(
      'research/biographies/03-Cricket-Legends/_books/virat-kohli/notes.md',
      alloc({ figures_effective: ['someone-else'] }),
      deps
    )
    expect(ok).toBe(false)
    expect(deps.figureProgram).not.toHaveBeenCalled()
  })

  test('research key: figures_effective grants (a comic grant unlocks research)', async () => {
    // The RESEARCH branch still uses figures_effective: a comic grant adds the
    // subject there, so the figure's research library is readable.
    const ok = await isKeyAllowedForMember(
      'research/biographies/03/_books/sachin-tendulkar/a.md',
      alloc({ comics: ['biographies__01-the-debut'], figures_effective: ['sachin-tendulkar'] })
    )
    expect(ok).toBe(true)
  })

  test('docs methodology: any authed member allowed (even empty allocation)', async () => {
    const ok = await isKeyAllowedForMember(
      'docs/methodology/x.md',
      alloc()
    )
    expect(ok).toBe(true)
  })

  test('docs research: any allowlisted member allowed (plain, unallocated)', async () => {
    const ok = await isKeyAllowedForMember(
      'docs/research/medicomics/autism/README.md',
      alloc()
    )
    expect(ok).toBe(true)
  })

  test('sites/medikidz: any allowlisted member allowed (plain, unallocated)', async () => {
    const ok = await isKeyAllowedForMember(
      'sites/medikidz/index.html',
      alloc()
    )
    expect(ok).toBe(true)
  })

  test('bogus docs/research traversal still denied (no line segment)', async () => {
    const ok = await isKeyAllowedForMember('docs/research/', alloc())
    expect(ok).toBe(false)
  })

  test('docs/comics: comic grant allows', async () => {
    const ok = await isKeyAllowedForMember(
      'docs/comics/biographies/sam-altman/01-the-optimist/bundle.md',
      alloc({ comics: ['biographies__01-the-optimist'] })
    )
    expect(ok).toBe(true)
  })

  test('docs/comics: line grant allows', async () => {
    const ok = await isKeyAllowedForMember(
      'docs/comics/biographies/sam-altman/01-the-optimist/bundle.md',
      alloc({ lines: ['biographies'] })
    )
    expect(ok).toBe(true)
  })

  test('docs/comics: RAW figure grant allows WITHOUT a comic-doc lookup (subject in-path)', async () => {
    const deps = mkDeps()
    const ok = await isKeyAllowedForMember(
      'docs/comics/biographies/sam-altman/01-the-optimist/bundle.md',
      alloc({ figures: ['sam-altman'] }),
      deps
    )
    expect(ok).toBe(true)
    expect(deps.comicMeta).not.toHaveBeenCalled()
  })

  test('docs/comics: empty allocation → deny', async () => {
    const ok = await isKeyAllowedForMember(
      'docs/comics/biographies/sam-altman/01-the-optimist/bundle.md',
      alloc()
    )
    expect(ok).toBe(false)
  })

  test('member with the comic grant may read its page images', async () => {
    const ok = await isKeyAllowedForMember(
      'images/comics/biographies/01-the-comic/pages/page-01.jpg',
      alloc({ comics: ['biographies__01-the-comic'] }),
      mkDeps(),
    )
    expect(ok).toBe(true)
  })

  test('member without the grant is denied the page images', async () => {
    const ok = await isKeyAllowedForMember(
      'images/comics/biographies/01-the-comic/pages/page-01.jpg',
      alloc({ lines: ['toddlers'] }),
      mkDeps(),
    )
    expect(ok).toBe(false)
  })

  test('member with a line grant may read the line\'s comic page images', async () => {
    const ok = await isKeyAllowedForMember(
      'images/comics/biographies/01-the-comic/cover.jpg',
      alloc({ lines: ['biographies'] }),
      mkDeps(),
    )
    expect(ok).toBe(true)
  })

  // ── Character sheets: artifacts/characters/{line}/{id}/… ─────────────────

  const RAMA_SHEET = 'artifacts/characters/indic/rama/rama-boy.png'
  const RAMA_THUMB = 'artifacts/characters/indic/rama/web/rama-boy.jpg'
  const LC_SHEET = 'artifacts/characters/shared/little-chanakya/base.png'

  // Rama is staged in two Rāmāyaṇa books; Little Chanakya (shared IP) in a
  // biographies book and a medicomics book.
  const INDIC_INDEX: CastIndex = {
    comics: {
      'indic__01-bala': { s: 'ramayana', p: 'itihasa' },
      'indic__02-ayodhya': { s: 'ramayana', p: 'itihasa' },
      'indic__09-other': { s: 'mahabharata', p: 'itihasa' },
    },
    chars: {
      rama: ['indic__01-bala', 'indic__02-ayodhya'],
      bhishma: ['indic__09-other'],
    },
  }
  const SHARED_INDEX: CastIndex = {
    comics: {
      'biographies__01-the-debut': { s: 'sachin-tendulkar', p: 'cricket-legends' },
      'medicomics__01-asthma': { s: 'asthma', p: null },
    },
    chars: {
      'little-chanakya': ['biographies__01-the-debut', 'medicomics__01-asthma'],
    },
  }
  const indexDeps = (index: CastIndex | null) =>
    mkDeps({ castIndex: vi.fn(async () => index) })

  test('character: a grant on its line allows WITHOUT reading the cast index', async () => {
    const deps = indexDeps(INDIC_INDEX)
    expect(await isKeyAllowedForMember(RAMA_SHEET, alloc({ lines: ['indic'] }), deps)).toBe(true)
    expect(deps.castIndex).not.toHaveBeenCalled()
  })

  test('character: a grant on ANOTHER line does not allow (index consulted, no match)', async () => {
    const deps = indexDeps(INDIC_INDEX)
    const ok = await isKeyAllowedForMember(RAMA_SHEET, alloc({ lines: ['biographies'] }), deps)
    expect(ok).toBe(false)
    expect(deps.castIndex).toHaveBeenCalledWith('indic')
  })

  test('character: a grant on a comic that stages it allows (index read once)', async () => {
    const deps = indexDeps(INDIC_INDEX)
    const ok = await isKeyAllowedForMember(
      RAMA_SHEET,
      alloc({ comics: ['indic__02-ayodhya'] }),
      deps
    )
    expect(ok).toBe(true)
    expect(deps.castIndex).toHaveBeenCalledTimes(1)
  })

  test('character: the web thumbnail is gated exactly like the full sheet', async () => {
    expect(
      await isKeyAllowedForMember(RAMA_THUMB, alloc({ comics: ['indic__01-bala'] }), indexDeps(INDIC_INDEX))
    ).toBe(true)
    expect(
      await isKeyAllowedForMember(RAMA_THUMB, alloc({ comics: ['indic__09-other'] }), indexDeps(INDIC_INDEX))
    ).toBe(false)
  })

  test('character: a grant on a comic that does NOT stage it → deny', async () => {
    const ok = await isKeyAllowedForMember(
      RAMA_SHEET,
      alloc({ comics: ['indic__09-other'] }),
      indexDeps(INDIC_INDEX)
    )
    expect(ok).toBe(false)
  })

  test('character: a RAW figure grant on a staging comic\'s subject allows', async () => {
    const ok = await isKeyAllowedForMember(
      RAMA_SHEET,
      alloc({ figures: ['ramayana'] }),
      indexDeps(INDIC_INDEX)
    )
    expect(ok).toBe(true)
  })

  test('character: figures_effective alone does NOT allow (comic semantics, RAW figures only)', async () => {
    const ok = await isKeyAllowedForMember(
      RAMA_SHEET,
      alloc({ figures_effective: ['ramayana'] }),
      indexDeps(INDIC_INDEX)
    )
    expect(ok).toBe(false)
  })

  test('character: a program grant on a staging comic\'s program allows', async () => {
    const ok = await isKeyAllowedForMember(
      RAMA_SHEET,
      alloc({ programs: ['itihasa'] }),
      indexDeps(INDIC_INDEX)
    )
    expect(ok).toBe(true)
  })

  test('character: program and figure grants that match no staging comic → deny', async () => {
    const ok = await isKeyAllowedForMember(
      RAMA_SHEET,
      alloc({ programs: ['cricket-legends'], figures: ['mahabharata'] }),
      indexDeps(INDIC_INDEX)
    )
    expect(ok).toBe(false)
  })

  test('character: an empty allocation → deny', async () => {
    expect(await isKeyAllowedForMember(RAMA_SHEET, alloc(), indexDeps(INDIC_INDEX))).toBe(false)
  })

  test('character: a null allocation → deny without reading the index', async () => {
    const deps = indexDeps(INDIC_INDEX)
    expect(await isKeyAllowedForMember(RAMA_SHEET, null, deps)).toBe(false)
    expect(deps.castIndex).not.toHaveBeenCalled()
  })

  test('character: a character missing from the index → deny', async () => {
    const ok = await isKeyAllowedForMember(
      'artifacts/characters/indic/sita/sita-young.png',
      alloc({ comics: ['indic__01-bala'], programs: ['itihasa'] }),
      indexDeps(INDIC_INDEX)
    )
    expect(ok).toBe(false)
  })

  test('character: a missing index (null) → deny', async () => {
    const ok = await isKeyAllowedForMember(
      RAMA_SHEET,
      alloc({ comics: ['indic__01-bala'] }),
      indexDeps(null)
    )
    expect(ok).toBe(false)
  })

  test('character: an index read that throws → deny (fail closed, never rejects)', async () => {
    const deps = mkDeps({
      castIndex: vi.fn(async () => {
        throw new Error('firestore down')
      }),
    })
    await expect(
      isKeyAllowedForMember(RAMA_SHEET, alloc({ comics: ['indic__01-bala'] }), deps)
    ).resolves.toBe(false)
  })

  test('character: the shared line is NEVER matched by a line grant', async () => {
    // Even a (bogus) `shared` line grant must go through the index; with no
    // staging comic the member is refused.
    const deps = indexDeps(SHARED_INDEX)
    const ok = await isKeyAllowedForMember(LC_SHEET, alloc({ lines: ['shared'] }), deps)
    expect(ok).toBe(false)
    expect(deps.castIndex).toHaveBeenCalledWith('shared')
  })

  test('character: shared IP is allowed through the LINE of a comic that stages it', async () => {
    const deps = indexDeps(SHARED_INDEX)
    const ok = await isKeyAllowedForMember(LC_SHEET, alloc({ lines: ['medicomics'] }), deps)
    expect(ok).toBe(true)
    expect(deps.castIndex).toHaveBeenCalledWith('shared')
  })

  test('character: shared IP is allowed through a comic, figure or program grant', async () => {
    for (const grant of [
      { comics: ['biographies__01-the-debut'] },
      { figures: ['sachin-tendulkar'] },
      { programs: ['cricket-legends'] },
    ]) {
      expect(await isKeyAllowedForMember(LC_SHEET, alloc(grant), indexDeps(SHARED_INDEX))).toBe(true)
    }
  })

  test('character: shared IP is refused to a member who sees none of its comics', async () => {
    const ok = await isKeyAllowedForMember(
      LC_SHEET,
      alloc({ lines: ['awareness'], comics: ['biographies__02-other'], programs: ['business-legends'] }),
      indexDeps(SHARED_INDEX)
    )
    expect(ok).toBe(false)
  })

  test('character: a malformed index never allows and never throws', async () => {
    const member = alloc({ lines: ['weird', ''], figures: [''], programs: [''], comics: ['indic__01-bala'] })
    const cases: unknown[] = [
      // chars entry is not an array
      { comics: {}, chars: { rama: 'indic__01-bala' } },
      // chars itself is not an object
      { comics: {}, chars: ['rama'] },
      // comic ids that are not strings, or empty
      { comics: {}, chars: { rama: [42, null, ''] } },
      // a comic id without `__` has no line part: a `weird` line grant is not a match
      { comics: {}, chars: { rama: ['weird'] } },
      // empty subject / program never match empty grants
      { comics: { 'indic__09-other': { s: '', p: '' } }, chars: { rama: ['indic__09-other'] } },
      // non-string subject / program are ignored
      { comics: { 'indic__09-other': { s: ['ramayana'], p: 7 } }, chars: { rama: ['indic__09-other'] } },
    ]
    for (const index of cases) {
      const ok = await isKeyAllowedForMember(RAMA_SHEET, member, indexDeps(index as CastIndex))
      expect(ok).toBe(false)
    }
  })

  test('character: Object built-ins are not characters (constructor, toString, …)', async () => {
    for (const id of ['constructor', 'toString', 'hasOwnProperty']) {
      const ok = await isKeyAllowedForMember(
        `artifacts/characters/indic/${id}/x.png`,
        alloc({ comics: ['indic__01-bala'] }),
        indexDeps(INDIC_INDEX)
      )
      expect(ok).toBe(false)
    }
  })

  test('character: only the index\'s OWN entries count (an inherited chars entry is ignored)', async () => {
    // `sita` resolves through the prototype to a comic the member holds; a
    // plain property read would allow it, so this pins the own-key check.
    const index = {
      comics: {},
      chars: Object.create({ sita: ['indic__01-bala'] }) as CastIndex['chars'],
    }
    const ok = await isKeyAllowedForMember(
      'artifacts/characters/indic/sita/sita-young.png',
      alloc({ comics: ['indic__01-bala'] }),
      indexDeps(index)
    )
    expect(ok).toBe(false)
  })

  test('character: only the index\'s OWN comic metadata counts (inherited s/p ignored)', async () => {
    const index = {
      comics: Object.create({
        'indic__09-other': { s: 'ramayana', p: 'itihasa' },
      }) as CastIndex['comics'],
      chars: { rama: ['indic__09-other'] },
    }
    const ok = await isKeyAllowedForMember(
      RAMA_SHEET,
      alloc({ figures: ['ramayana'], programs: ['itihasa'] }),
      indexDeps(index)
    )
    expect(ok).toBe(false)
  })

  test('character: a malformed character key (no file) is denied even with a line grant', async () => {
    const deps = indexDeps(INDIC_INDEX)
    expect(await isKeyAllowedForMember('artifacts/characters/indic/rama', alloc({ lines: ['indic'] }), deps)).toBe(false)
    expect(await isKeyAllowedForMember('artifacts/characters/indic', alloc({ lines: ['indic'] }), deps)).toBe(false)
    expect(deps.castIndex).not.toHaveBeenCalled()
  })

  test('character: the DEFAULT deps read castIndex/{line} from Firestore', async () => {
    castIndexGet.mockResolvedValue({ exists: true, data: () => INDIC_INDEX })
    expect(await isKeyAllowedForMember(RAMA_SHEET, alloc({ comics: ['indic__01-bala'] }))).toBe(true)
    expect(castIndexGet).toHaveBeenCalledWith('indic')
  })

  test('character: the DEFAULT deps deny when castIndex/{line} is absent', async () => {
    expect(await isKeyAllowedForMember(RAMA_SHEET, alloc({ comics: ['indic__01-bala'] }))).toBe(false)
  })

  test('character: the DEFAULT deps deny (resolve false) when the index read throws', async () => {
    castIndexGet.mockRejectedValue(new Error('firestore down'))
    await expect(
      isKeyAllowedForMember(RAMA_SHEET, alloc({ comics: ['indic__01-bala'] }))
    ).resolves.toBe(false)
  })

  test('character: a batch of thumbnails costs one index read per line', async () => {
    castIndexGet.mockResolvedValue({ exists: true, data: () => INDIC_INDEX })
    const keys = Array.from({ length: 50 }, (_, i) => `artifacts/characters/indic/rama/web/stage-${i}.jpg`)
    const member = alloc({ comics: ['indic__01-bala'] })
    const results = await Promise.all(keys.map((k) => isKeyAllowedForMember(k, member)))
    expect(results.every(Boolean)).toBe(true)
    expect(castIndexGet).toHaveBeenCalledTimes(1)
  })

  // ── Research bundles: bundles/research/{line}/{figure}/… ─────────────────

  const JOBS_ALL = 'bundles/research/biographies/steve-jobs/all.zip'
  const JOBS_SOURCE = 'bundles/research/biographies/steve-jobs/sources/isaacson.zip'

  test('bundle: a line grant allows', async () => {
    expect(await isKeyAllowedForMember(JOBS_ALL, alloc({ lines: ['biographies'] }), mkDeps())).toBe(true)
  })

  test('bundle: figures_effective allows (a comic grant unlocks the research library)', async () => {
    const ok = await isKeyAllowedForMember(
      JOBS_SOURCE,
      alloc({ comics: ['biographies__01-think-different'], figures_effective: ['steve-jobs'] }),
      mkDeps()
    )
    expect(ok).toBe(true)
  })

  test('bundle: a program grant allows through the figure-doc lookup', async () => {
    const deps = mkDeps({ figureProgram: vi.fn(async () => 'tech-legends') })
    const ok = await isKeyAllowedForMember(JOBS_ALL, alloc({ programs: ['tech-legends'] }), deps)
    expect(ok).toBe(true)
    expect(deps.figureProgram).toHaveBeenCalledWith('steve-jobs')
  })

  test('bundle: a figure in another program → deny', async () => {
    const deps = mkDeps({ figureProgram: vi.fn(async () => 'business-legends') })
    expect(await isKeyAllowedForMember(JOBS_ALL, alloc({ programs: ['tech-legends'] }), deps)).toBe(false)
  })

  test('bundle: another figure\'s grant, or another line\'s, → deny', async () => {
    expect(
      await isKeyAllowedForMember(JOBS_ALL, alloc({ figures_effective: ['bill-gates'], lines: ['indic'] }), mkDeps())
    ).toBe(false)
  })

  test('bundle: an unattributable bundle shape is denied even with a line grant', async () => {
    const member = alloc({ lines: ['biographies'], figures_effective: ['steve-jobs'] })
    for (const key of [
      'bundles/other/biographies/steve-jobs/all.zip',
      'bundles/research/_state.json',
      'bundles/research/biographies',
      'bundles/research/biographies/steve-jobs',
    ]) {
      expect(await isKeyAllowedForMember(key, member, mkDeps())).toBe(false)
    }
  })

  test('bundle: never consults the cast index', async () => {
    const deps = mkDeps()
    await isKeyAllowedForMember(JOBS_ALL, alloc({ figures_effective: ['steve-jobs'] }), deps)
    expect(deps.castIndex).not.toHaveBeenCalled()
  })
})

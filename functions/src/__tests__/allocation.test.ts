import { beforeEach, describe, expect, test, vi } from 'vitest'

// ─── Mocks for firebase-admin/firestore ────────────────────────────────────
//
// `getFirestore().collection(name).doc(id).get()` is routed per collection:
//   `allocations` → allocGet, `figures` → figureGet, everything else → comicGet.
// Each defaults to {exists:false} so absent docs are the baseline.

const allocGet = vi.fn()
const comicGet = vi.fn()
const figureGet = vi.fn()

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => ({
        get: name === 'allocations' ? allocGet : name === 'figures' ? figureGet : comicGet,
      })),
    })),
  })),
}))

import {
  scopeOfKey,
  getAllocation,
  comicMeta,
  figureProgram,
  isKeyAllowedForMember,
  type Allocation,
  type AllocationDeps,
} from '../allocation'

beforeEach(() => {
  allocGet.mockReset()
  comicGet.mockReset()
  figureGet.mockReset()
  allocGet.mockResolvedValue({ exists: false, data: () => ({}) })
  comicGet.mockResolvedValue({ exists: false, data: () => ({}) })
  figureGet.mockResolvedValue({ exists: false, data: () => ({}) })
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
})

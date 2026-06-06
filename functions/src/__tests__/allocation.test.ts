import { beforeEach, describe, expect, test, vi } from 'vitest'

// ─── Mocks for firebase-admin/firestore ────────────────────────────────────
//
// `getFirestore().collection(name).doc(id).get()` is routed per collection:
//   `allocations` → allocGet, `comics` → comicGet.
// Each defaults to {exists:false} so absent docs are the baseline.

const allocGet = vi.fn()
const comicGet = vi.fn()

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => ({
        get: name === 'allocations' ? allocGet : comicGet,
      })),
    })),
  })),
}))

import {
  scopeOfKey,
  getAllocation,
  comicSubject,
  isKeyAllowedForMember,
  type Allocation,
} from '../allocation'

beforeEach(() => {
  allocGet.mockReset()
  comicGet.mockReset()
  allocGet.mockResolvedValue({ exists: false, data: () => ({}) })
  comicGet.mockResolvedValue({ exists: false, data: () => ({}) })
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
      name: 'docs/whatever (unrecognized) → {}',
      key: 'docs/whatever',
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
      }),
    })
    expect(await getAllocation('m@x.com')).toEqual({
      lines: ['biographies'],
      figures: ['sachin-tendulkar'],
      figures_effective: ['sachin-tendulkar', 'dhirubhai-ambani'],
      comics: ['biographies__a'],
    })
  })

  test('missing figures / figures_effective default to []', async () => {
    allocGet.mockResolvedValue({
      exists: true,
      data: () => ({ lines: ['biographies'], comics: ['biographies__a'] }),
    })
    expect(await getAllocation('m@x.com')).toEqual({
      lines: ['biographies'],
      figures: [],
      figures_effective: [],
      comics: ['biographies__a'],
    })
  })

  test('non-array fields are coerced to []', async () => {
    allocGet.mockResolvedValue({
      exists: true,
      data: () => ({ lines: 'oops', figures: {}, figures_effective: null, comics: 5 }),
    })
    expect(await getAllocation('m@x.com')).toEqual({
      lines: [],
      figures: [],
      figures_effective: [],
      comics: [],
    })
  })
})

// ─── comicSubject ────────────────────────────────────────────────────────────

describe('comicSubject', () => {
  test('present → subject_slug', async () => {
    comicGet.mockResolvedValue({
      exists: true,
      data: () => ({ subject_slug: 'dhirubhai-ambani' }),
    })
    expect(await comicSubject('biographies__01')).toBe('dhirubhai-ambani')
  })

  test('absent → null', async () => {
    comicGet.mockResolvedValue({ exists: false })
    expect(await comicSubject('biographies__01')).toBeNull()
  })
})

// ─── isKeyAllowedForMember ───────────────────────────────────────────────────

describe('isKeyAllowedForMember', () => {
  const alloc = (over: Partial<Allocation> = {}): Allocation => ({
    lines: [],
    figures: [],
    figures_effective: [],
    comics: [],
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
    const deps = {
      comicSubject: vi.fn(async () => 'sachin-tendulkar'),
    }
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/01-the-debut.html',
      alloc({ figures: ['sachin-tendulkar'] }),
      deps
    )
    expect(ok).toBe(true)
    expect(deps.comicSubject).toHaveBeenCalledWith('biographies__01-the-debut')
  })

  test('draft key: figures_effective does NOT grant the comic (sibling-comic leak)', async () => {
    // A single-comic grant adds the subject to figures_effective. That must NOT
    // unlock the figure's OTHER (sibling) comics — only the comic-id grant or a
    // RAW figure grant may. Here the member was granted a sibling comic (so the
    // subject is in figures_effective) but NOT this comic and NOT the raw figure.
    const deps = { comicSubject: vi.fn(async () => 'sachin-tendulkar') }
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/02-the-sibling.html',
      alloc({ comics: ['biographies__01-the-debut'], figures_effective: ['sachin-tendulkar'] }),
      deps
    )
    expect(ok).toBe(false)
  })

  test('draft key: no comic-doc lookup when a line grant already allows', async () => {
    const deps = { comicSubject: vi.fn() }
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/01-the-debut.html',
      alloc({ lines: ['biographies'] }),
      deps
    )
    expect(ok).toBe(true)
    expect(deps.comicSubject).not.toHaveBeenCalled()
  })

  test('draft key: no comic-doc lookup when RAW figures is empty', async () => {
    // figures_effective is non-empty but figures is empty → the comic branch
    // never looks up the subject (it would only test RAW figures).
    const deps = { comicSubject: vi.fn() }
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/02-the-sibling.html',
      alloc({ figures_effective: ['sachin-tendulkar'] }),
      deps
    )
    expect(ok).toBe(false)
    expect(deps.comicSubject).not.toHaveBeenCalled()
  })

  test('draft key: subject lookup misses → deny', async () => {
    const deps = { comicSubject: vi.fn(async () => 'someone-else') }
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/01-the-debut.html',
      alloc({ figures: ['sachin-tendulkar'] }),
      deps
    )
    expect(ok).toBe(false)
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
    const deps = { comicSubject: vi.fn() }
    const ok = await isKeyAllowedForMember(
      'docs/comics/biographies/sam-altman/01-the-optimist/bundle.md',
      alloc({ figures: ['sam-altman'] }),
      deps
    )
    expect(ok).toBe(true)
    expect(deps.comicSubject).not.toHaveBeenCalled()
  })

  test('docs/comics: empty allocation → deny', async () => {
    const ok = await isKeyAllowedForMember(
      'docs/comics/biographies/sam-altman/01-the-optimist/bundle.md',
      alloc()
    )
    expect(ok).toBe(false)
  })
})

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
      data: () => ({ lines: ['biographies'], comics: ['biographies__a'] }),
    })
    expect(await getAllocation('m@x.com')).toEqual({
      lines: ['biographies'],
      figures_effective: [],
      comics: ['biographies__a'],
    })
  })

  test('non-array fields are coerced to []', async () => {
    allocGet.mockResolvedValue({
      exists: true,
      data: () => ({ lines: 'oops', figures_effective: null, comics: 5 }),
    })
    expect(await getAllocation('m@x.com')).toEqual({
      lines: [],
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

  test('draft key: figure grant matched via comic-doc subject lookup', async () => {
    const deps = {
      comicSubject: vi.fn(async () => 'sachin-tendulkar'),
    }
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/01-the-debut.html',
      alloc({ figures_effective: ['sachin-tendulkar'] }),
      deps
    )
    expect(ok).toBe(true)
    expect(deps.comicSubject).toHaveBeenCalledWith('biographies__01-the-debut')
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

  test('draft key: subject lookup misses → deny', async () => {
    const deps = { comicSubject: vi.fn(async () => 'someone-else') }
    const ok = await isKeyAllowedForMember(
      'drafts/biographies/01-the-debut.html',
      alloc({ figures_effective: ['sachin-tendulkar'] }),
      deps
    )
    expect(ok).toBe(false)
  })
})

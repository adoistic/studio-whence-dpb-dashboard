import { describe, expect, it, test } from 'vitest'
import { buildCoverRefKey, safeKey, RESOLVE_PREFIXES, READ_PREFIXES, WRITE_PREFIXES } from '../keys'

describe('WRITE_PREFIXES', () => {
  it('accepts an idea image key', () => {
    expect(safeKey('images/ideas/abc/p.png', WRITE_PREFIXES)).toBe('images/ideas/abc/p.png')
  })
  it('rejects a non-idea key', () => {
    expect(safeKey('research/x.md', WRITE_PREFIXES)).toBeNull()
  })
  it('rejects traversal', () => {
    expect(safeKey('images/ideas/../secrets/x', WRITE_PREFIXES)).toBeNull()
  })
  it('accepts a cover-ref artifacts key', () => {
    expect(safeKey('artifacts/comics/legacy/x/cover-refs/p.png', WRITE_PREFIXES))
      .toBe('artifacts/comics/legacy/x/cover-refs/p.png')
  })
})

describe('buildCoverRefKey', () => {
  it('builds a confined cover-ref key and sanitizes the filename', () => {
    expect(buildCoverRefKey('legacy', 'hanuman-celestial-superpower', 'My Cover.png', 'u1'))
      .toBe('artifacts/comics/legacy/hanuman-celestial-superpower/cover-refs/My_Cover-u1.png')
  })
  it('rejects a bad line or slug', () => {
    expect(buildCoverRefKey('legacy', 'has space', 'a.png')).toBeNull()
    expect(buildCoverRefKey('../x', 'y', 'a.png')).toBeNull()
  })
  it('rejects an empty filename', () => {
    expect(buildCoverRefKey('legacy', 'x', '')).toBeNull()
  })
})

describe('safeKey', () => {
  test('rejects traversal', () => {
    expect(safeKey('research/../content.json', RESOLVE_PREFIXES)).toBeNull()
  })

  test('rejects leading slash', () => {
    expect(safeKey('/research/x.md', RESOLVE_PREFIXES)).toBeNull()
  })

  test('rejects disallowed prefix', () => {
    expect(safeKey('secrets/x', RESOLVE_PREFIXES)).toBeNull()
  })

  test('allows research + drafts + images + artifacts', () => {
    for (const p of [
      'research/a/b.md',
      'drafts/x.html',
      'images/y.jpg',
      'artifacts/z.pdf',
    ]) {
      expect(safeKey(p, RESOLVE_PREFIXES)).toBe(p)
    }
  })

  test('content.json is NOT presignable via /resolve', () => {
    expect(safeKey('content.json', RESOLVE_PREFIXES)).toBeNull()
  })

  test('/read allows research + drafts but not images', () => {
    expect(safeKey('research/x.md', READ_PREFIXES)).toBe('research/x.md')
    expect(safeKey('drafts/x.html', READ_PREFIXES)).toBe('drafts/x.html')
    expect(safeKey('images/y.jpg', READ_PREFIXES)).toBeNull()
  })

  test('rejects backslash (Windows-style traversal)', () => {
    expect(safeKey('research\\..\\secrets', RESOLVE_PREFIXES)).toBeNull()
  })

  test('rejects double-encoded traversal that survives one decode', () => {
    // After ONE decode -> "research/../content.json" -> contains ".." -> null
    expect(safeKey('research/%2e%2e/content.json', RESOLVE_PREFIXES)).toBeNull()
  })

  test('rejects leading slash that appears only after decode', () => {
    // "%2fresearch/x.md" -> "/research/x.md" -> leading slash -> null
    expect(safeKey('%2fresearch/x.md', RESOLVE_PREFIXES)).toBeNull()
  })

  test('rejects literal .. segment under an allowed prefix', () => {
    expect(safeKey('drafts/../images/x.jpg', RESOLVE_PREFIXES)).toBeNull()
  })

  test('rejects malformed percent-encoding without throwing', () => {
    expect(safeKey('research/%E0%A4', RESOLVE_PREFIXES)).toBeNull()
  })

  test('rejects prefix-substring match without trailing slash (research-evil/)', () => {
    expect(safeKey('research-evil/x.md', RESOLVE_PREFIXES)).toBeNull()
  })

  test('allows docs/ keys through /resolve', () => {
    expect(
      safeKey('docs/methodology/diamond-books.read.md', RESOLVE_PREFIXES)
    ).toBe('docs/methodology/diamond-books.read.md')
    expect(
      safeKey('docs/comics/biographies/x/01-y/bundle.md', RESOLVE_PREFIXES)
    ).toBe('docs/comics/biographies/x/01-y/bundle.md')
  })

  test('allows docs/ keys through /read', () => {
    expect(safeKey('docs/methodology/x.md', READ_PREFIXES)).toBe(
      'docs/methodology/x.md'
    )
  })

  test('docs/ traversal is still rejected', () => {
    expect(safeKey('docs/../secrets/x', RESOLVE_PREFIXES)).toBeNull()
  })

  test('/read allows ai-conversations keys', () => {
    expect(safeKey('ai-conversations/abc.md', READ_PREFIXES)).toBe(
      'ai-conversations/abc.md'
    )
  })

  test('ai-conversations traversal is rejected via /read', () => {
    expect(safeKey('ai-conversations/../secret', READ_PREFIXES)).toBeNull()
  })

  test('ai-conversations is NOT presignable via /resolve', () => {
    expect(safeKey('ai-conversations/abc.md', RESOLVE_PREFIXES)).toBeNull()
  })

  test('/read allows sites/ keys (medikidz embed)', () => {
    expect(safeKey('sites/medikidz/index.html', READ_PREFIXES)).toBe(
      'sites/medikidz/index.html'
    )
  })

  test('sites/ traversal is rejected via /read', () => {
    expect(safeKey('sites/../secrets/x', READ_PREFIXES)).toBeNull()
  })

  test('/read allows panels/ keys (Panels-view page model)', () => {
    expect(
      safeKey('panels/biographies/01-betting-on-the-impossible.json', READ_PREFIXES)
    ).toBe('panels/biographies/01-betting-on-the-impossible.json')
  })

  test('panels/ is NOT presignable via /resolve', () => {
    expect(
      safeKey('panels/biographies/01-betting-on-the-impossible.json', RESOLVE_PREFIXES)
    ).toBeNull()
  })

  test('panels/ traversal is rejected via /read', () => {
    expect(safeKey('panels/../secrets/x.json', READ_PREFIXES)).toBeNull()
  })

  test('panels/ rejects double-encoded traversal that survives one decode', () => {
    expect(safeKey('panels/%2e%2e/secrets/x.json', READ_PREFIXES)).toBeNull()
  })
})

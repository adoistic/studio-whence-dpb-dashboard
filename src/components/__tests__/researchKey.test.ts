/**
 * Tests for researchKey — the tolerant R2 read-key resolver on the figure page.
 *
 * Biography source paths are repo-relative and get `research/` prepended;
 * medicomics dossier paths are already full R2 keys under a known read-prefix
 * (docs/ research/ artifacts/) and are used verbatim.
 */

import { describe, expect, test, vi } from 'vitest'

// FigurePageShell transitively imports @/lib/firebase (via AiConversations →
// useAiConversations), whose module-load getAuth() needs a real API key. Stub it
// so the pure researchKey export can be imported in isolation.
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))

import { researchKey } from '@/components/FigurePageShell'

describe('researchKey', () => {
  test('null → null', () => {
    expect(researchKey(null)).toBeNull()
  })

  test('an absolute docs/ key is returned unchanged (medicomics dossier)', () => {
    const k = 'docs/research/medicomics/autism/_books/x/source.md'
    expect(researchKey(k)).toBe(k)
  })

  test('a repo-relative biography path gets research/ prepended', () => {
    expect(researchKey('biographies/01-x/_books/y/chapters/01.md')).toBe(
      'research/biographies/01-x/_books/y/chapters/01.md',
    )
  })

  test('an already-research/ key is returned unchanged (no double prefix)', () => {
    expect(researchKey('research/biographies/01-x/chapters/01.md')).toBe(
      'research/biographies/01-x/chapters/01.md',
    )
  })

  test('an artifacts/ key is returned unchanged', () => {
    expect(researchKey('artifacts/foo/bar.md')).toBe('artifacts/foo/bar.md')
  })
})

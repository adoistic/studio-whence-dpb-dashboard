import { describe, test, expect } from 'vitest'
import { exportableThreads } from '@/components/ComicExportButton'
import type { Thread } from '@/lib/feedbackTypes'

const thread = (lang: string, langScope: string): Thread => ({
  root: {
    id: lang + langScope, comicId: 'c', line: 'l', parentId: null, anchors: [],
    authorEmail: 'a@b.c', authorName: 'A', authorRole: 'allow', body: 'b',
    comicVersion: 1, hidden: false, createdAt: 0, lang, langScope,
  },
  replies: [],
})

describe('exportableThreads', () => {
  test('exports only what applies to the language being read', () => {
    const all = [thread('en', 'en'), thread('hi', 'hi'), thread('en', 'all')]
    expect(exportableThreads(all, 'hi', 'hi').map((t) => t.root.id))
      .toEqual(['hihi', 'enall'])
  })

  test('a legacy thread with no language is attributed to the original', () => {
    const legacy = thread('en', 'en')
    delete (legacy.root as { lang?: string }).lang
    delete (legacy.root as { langScope?: string }).langScope
    expect(exportableThreads([legacy], 'hi', 'hi')).toHaveLength(1)
    expect(exportableThreads([legacy], 'en', 'hi')).toHaveLength(0)
  })
})

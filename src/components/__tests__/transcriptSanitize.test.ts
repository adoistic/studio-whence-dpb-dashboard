import { describe, it, expect, vi } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { rehypeSourceLines } from '@/lib/rehypeSourceLines'

// AiConversations transitively imports @/lib/firebase, which calls getAuth() at
// module load and throws without real env. We only need the exported schema, so
// stub the firebase module (same approach as aiConversations.test.ts).
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))

import { TRANSCRIPT_SCHEMA } from '@/components/AiConversations'

// Locks the security guarantee of AiConversations.tsx: untrusted transcript
// markdown is rendered through the SAME rehype chain the component uses —
// [rehypeSourceLines, [rehypeSanitize, TRANSCRIPT_SCHEMA]] — and that chain
// must keep blocking injection. rehypeRaw is deliberately NOT in the chain, so
// raw HTML is dropped wholesale. If a future edit widens TRANSCRIPT_SCHEMA or
// re-adds raw-HTML passthrough, these assertions break.
const render = (md: string): string =>
  String(
    unified()
      .use(remarkParse)
      .use(remarkRehype)
      .use(rehypeSourceLines)
      .use(rehypeSanitize, TRANSCRIPT_SCHEMA)
      .use(rehypeStringify)
      .processSync(md),
  )

describe('transcript sanitize (TRANSCRIPT_SCHEMA)', () => {
  it('strips a <script> tag', () => {
    const out = render('<script>alert(1)</script>')
    expect(out).not.toContain('<script')
  })

  it('drops a raw <img> with an onerror handler (raw HTML not parsed)', () => {
    const out = render('<img src=x onerror=alert(1)>')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('<img')
  })

  it('removes a javascript: link target', () => {
    const out = render('[x](javascript:alert(1))')
    expect(out).not.toContain('javascript:')
  })

  it('drops an onclick handler on a raw element', () => {
    const out = render('<div onclick="alert(1)">hi</div>')
    expect(out).not.toContain('onclick')
  })

  it('SANITY: keeps normal prose and the rehypeSourceLines data-sl stamp', () => {
    const out = render('A normal paragraph.')
    expect(out).toContain('A normal paragraph.')
    // rehypeSourceLines stamps each block with its markdown line range; the
    // widened schema must still allow data-sl through for scroll-to-line.
    expect(out).toContain('data-sl')
  })
})

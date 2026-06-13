import { describe, expect, test } from 'vitest'
import { rewriteMedikidzHtml } from '../medikidzSite'

// A stub presigner: maps an R2 key → a deterministic fake presigned URL.
const presign = (k: string) => `https://r2.example/${k}?sig=X`

describe('rewriteMedikidzHtml', () => {
  test('rewrites BOTH static <img src> and JS string literals; no bare path remains', () => {
    const html = [
      '<!doctype html><html><body>',
      '<img src="assets/covers/a.jpg">',
      '<script>',
      'const BOOKS=[{cover:"assets/covers/b.jpg",pages:[{src:"assets/pages/c.jpg"}]}];',
      '</script>',
      '</body></html>',
    ].join('\n')

    const out = rewriteMedikidzHtml(html, presign)

    // All three bare paths became presigned URLs under sites/medikidz/.
    expect(out).toContain('https://r2.example/sites/medikidz/assets/covers/a.jpg?sig=X')
    expect(out).toContain('https://r2.example/sites/medikidz/assets/covers/b.jpg?sig=X')
    expect(out).toContain('https://r2.example/sites/medikidz/assets/pages/c.jpg?sig=X')

    // No BARE asset path survives — every remaining occurrence is part of a
    // presigned URL (preceded by the sites/medikidz/ prefix). A bare token is
    // one immediately following an opening quote.
    expect(out).not.toMatch(/["']assets\/(covers|pages)\//)
  })

  test('rewrites every occurrence of the SAME path (per-occurrence)', () => {
    const html = '<img src="assets/pages/x.jpg"><img src="assets/pages/x.jpg">'
    const out = rewriteMedikidzHtml(html, presign)
    const matches = out.match(/https:\/\/r2\.example\/sites\/medikidz\/assets\/pages\/x\.jpg\?sig=X/g)
    expect(matches).toHaveLength(2)
    expect(out).not.toMatch(/"assets\/pages\/x\.jpg"/)
  })

  test('leaves html with no asset paths unchanged', () => {
    const html = '<html><body><p>No images here.</p></body></html>'
    expect(rewriteMedikidzHtml(html, presign)).toBe(html)
  })

  test('handles nested subfolders in the asset path', () => {
    const html = 'src:"assets/pages/sub/deep-1.jpg"'
    const out = rewriteMedikidzHtml(html, presign)
    expect(out).toContain('https://r2.example/sites/medikidz/assets/pages/sub/deep-1.jpg?sig=X')
  })
})

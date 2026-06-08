import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '@/lib/ideaHtmlToMarkdown'

describe('htmlToMarkdown', () => {
  it('converts headings and emphasis', () => {
    expect(htmlToMarkdown('<h2>Title</h2><p><strong>bold</strong> and <em>it</em></p>'))
      .toContain('## Title')
  })
  it('converts links', () => {
    expect(htmlToMarkdown('<p><a href="https://x.io">x</a></p>')).toContain('[x](https://x.io)')
  })
  it('converts a simple table to a GFM pipe table', () => {
    const md = htmlToMarkdown('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>')
    expect(md).toMatch(/\|\s*A\s*\|\s*B\s*\|/)
    expect(md).toMatch(/\|\s*1\s*\|\s*2\s*\|/)
  })
  it('keeps a NESTED table as raw HTML (outer has a header row)', () => {
    // The outer table HAS a header row, so gfm would convert it to a pipe table
    // and destroy the inner <table> — unless the nested-table is spliced out as
    // raw HTML. This proves the extractNestedTables path, not gfm's headerless
    // fallback.
    const html =
      '<table><tr><th>H</th></tr><tr><td><table><tr><td>inner</td></tr></table></td></tr></table>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('<table')
    expect(md).toContain('inner')
    // The inner content must NOT have been flattened into a pipe-table cell.
    expect(md).not.toMatch(/\|\s*inner\s*\|/)
  })
  it('drops text alignment', () => {
    const md = htmlToMarkdown('<p style="text-align:center">hello world</p>')
    expect(md).toBe('hello world')
    expect(md).not.toContain('text-align')
  })
  it('preserves single newlines as hard breaks', () => {
    const md = htmlToMarkdown('<p>line one<br>line two</p>')
    expect(md).toMatch(/line one(\\\n|  \n)line two/)
  })
  it('emits r2: token for an image with data-r2-key', () => {
    const md = htmlToMarkdown('<p><img src="https://signed.example/x" data-r2-key="images/ideas/abc/p.png" alt="shot"></p>')
    expect(md).toContain('![shot](r2:images/ideas/abc/p.png)')
  })
  it('keeps a data: URI image inline', () => {
    const md = htmlToMarkdown('<p><img src="data:image/png;base64,AAAA" alt="tiny"></p>')
    expect(md).toContain('![tiny](data:image/png;base64,AAAA)')
  })
})

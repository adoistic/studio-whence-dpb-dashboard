import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { rehypeSourceLines } from '@/lib/rehypeSourceLines'

async function run(md: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeSourceLines)
    .use(rehypeStringify)
    .process(md)
  return String(file)
}

describe('rehypeSourceLines', () => {
  it('stamps data-sl / data-el from node position', async () => {
    const html = await run('line one\n\nline three para\n')
    expect(html).toMatch(/data-sl="1"/)
    expect(html).toMatch(/data-sl="3"/)
  })

  it('does not write data-sl="undefined" for position-less nodes', async () => {
    const html = await run('# heading\n\ntext\n')
    expect(html).not.toContain('data-sl="undefined"')
  })
})

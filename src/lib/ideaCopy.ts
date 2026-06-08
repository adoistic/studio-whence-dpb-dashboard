import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'

export interface ResolvedImage { dataUri: string; bytes: number }
export type ImageResolver = (key: string) => Promise<ResolvedImage>
export interface ClipboardPayload { html: string; text: string }

/** Total base64 budget for a single copy (8 MB of inlined images). */
export const MAX_INLINE_BYTES = 8 * 1024 * 1024

export async function buildClipboardPayload(
  markdown: string,
  resolveImage: ImageResolver,
): Promise<ClipboardPayload> {
  const keys = Array.from(markdown.matchAll(/!\[[^\]]*\]\(r2:([^)\s]+)\)/g)).map((m) => m[1])
  const map = new Map<string, string>()
  let spent = 0
  for (const key of keys) {
    if (map.has(key)) continue
    const { dataUri, bytes } = await resolveImage(key)
    if (dataUri && spent + bytes <= MAX_INLINE_BYTES) {
      map.set(key, dataUri)
      spent += bytes
    }
  }
  const replaced = markdown.replace(/(!\[[^\]]*\]\()r2:([^)\s]+)(\))/g,
    (_full, pre, key, post) => `${pre}${map.get(key) ?? ''}${post}`)
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(replaced)
  return { html: String(file), text: markdown }
}

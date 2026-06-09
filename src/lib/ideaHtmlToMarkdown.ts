import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

// Token must be markdown-INERT: Turndown escapes `_`/`*`/etc. in text nodes,
// which would break a literal string match on splice-back. Letters+digits only.
const PLACEHOLDER = (i: number) => `xxIDEANESTEDTABLExx${i}xx`

/**
 * Replace each top-level table that contains a nested table with a text
 * placeholder, returning the stripped HTML and the stash of raw table HTML.
 * "Top-level" = a nested-containing table not itself inside another table.
 */
function extractNestedTables(html: string): { html: string; stash: string[] } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const stash: string[] = []
  const tables = Array.from(doc.querySelectorAll('table'))
  for (const table of tables) {
    const containsTable = table.querySelector('table') !== null
    const insideTable = table.parentElement?.closest('table') != null
    if (containsTable && !insideTable) {
      const placeholder = doc.createElement('p')
      placeholder.textContent = PLACEHOLDER(stash.length)
      stash.push(table.outerHTML)
      table.replaceWith(placeholder)
    }
  }
  return { html: doc.body.innerHTML, stash }
}

function makeService(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    br: '\\', // hard break marker → backslash + newline
  })
  td.use(gfm) // simple tables → GFM pipe tables; alignment/style attrs ignored natively

  td.addRule('ideaImage', {
    filter: 'img',
    replacement: (_content, node) => {
      const el = node as Element
      const alt = (el.getAttribute('alt') ?? '').replace(/[\[\]]/g, '')
      const key = el.getAttribute('data-r2-key')
      const src = el.getAttribute('src') ?? ''
      const url = key ? `r2:${key}` : src
      return url ? `![${alt}](${url})` : ''
    },
  })

  return td
}

/** Convert sanitized editor HTML to canonical Markdown. */
export function htmlToMarkdown(html: string): string {
  const { html: stripped, stash } = extractNestedTables(html)
  let md = makeService().turndown(stripped)
  stash.forEach((raw, i) => {
    md = md.replace(PLACEHOLDER(i), `\n\n${raw}\n\n`)
  })
  return md.trim()
}

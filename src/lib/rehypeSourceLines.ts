import { visit } from 'unist-util-visit'
import type { Root, Element } from 'hast'

/**
 * Stamp every rendered element with the source-line range it came from, so the
 * research reader can scroll to the markdown line a [src:] cite points at.
 * data-sl = start line, data-el = end line. Nodes without position info (e.g.
 * synthesized table cells) are skipped — never stamped "undefined".
 */
export function rehypeSourceLines() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      const pos = node.position
      const start = pos?.start?.line
      if (typeof start !== 'number') return
      node.properties = node.properties ?? {}
      node.properties['dataSl'] = start
      const end = pos?.end?.line
      if (typeof end === 'number') node.properties['dataEl'] = end
    })
  }
}

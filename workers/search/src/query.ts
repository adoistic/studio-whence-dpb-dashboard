/**
 * query.ts — the portal's search grammar.
 *
 *   ambani                  one required term, fuzzy + prefix
 *   "polyester prince"      one required term, exact phrase
 *   ambani textile          both required (a space is AND — it is what people type)
 *   ambani, textile         the same, spelled explicitly
 *   mill | textile          either
 *   ambani, mill | textile  ambani AND (mill OR textile)
 *
 * Two levels only: the outer list is AND, each inner list is OR. `|` binds
 * tighter than the comma. No parentheses — the two levels cover the real cases
 * without becoming a query language nobody remembers.
 */
export interface Term {
  text: string
  exact: boolean
}

/** Outer array = AND groups; inner array = OR alternatives within a group. */
export type Query = Term[][]

interface RawToken {
  value: string
  exact: boolean
}

/** Split on whitespace, commas and pipes, keeping quoted runs whole. */
function tokenize(raw: string): (RawToken | ',' | '|')[] {
  const out: (RawToken | ',' | '|')[] = []
  let buf = ''
  let quoted = false

  const flush = () => {
    const value = buf.trim()
    if (value) out.push({ value, exact: false })
    buf = ''
  }

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '"') {
      if (quoted) {
        const value = buf.trim()
        if (value) out.push({ value, exact: true })
        buf = ''
        quoted = false
      } else {
        flush()
        quoted = true
      }
      continue
    }
    if (quoted) { buf += ch; continue }
    if (ch === ',') { flush(); out.push(','); continue }
    if (ch === '|') { flush(); out.push('|'); continue }
    if (/\s/.test(ch)) { flush(); continue }
    buf += ch
  }
  // An unclosed quote runs to the end of input — a half-typed query should
  // still search rather than silently return nothing.
  if (quoted) {
    const value = buf.trim()
    if (value) out.push({ value, exact: true })
  } else {
    flush()
  }
  return out
}

export function parseQuery(raw: string): Query {
  const groups: Query = []
  let current: Term[] = []
  let pendingOr = false

  const closeGroup = () => {
    if (current.length) groups.push(current)
    current = []
    pendingOr = false
  }

  for (const token of tokenize(raw)) {
    if (token === ',') { closeGroup(); continue }
    if (token === '|') { pendingOr = true; continue }

    // Bare AND / OR keywords, for people who type that way.
    if (!token.exact && token.value.toUpperCase() === 'OR') { pendingOr = true; continue }
    if (!token.exact && token.value.toUpperCase() === 'AND') { closeGroup(); continue }

    const term: Term = { text: token.value.toLowerCase(), exact: token.exact }
    if (pendingOr && current.length) {
      current.push(term)
      pendingOr = false
    } else {
      closeGroup()
      current = [term]
    }
  }
  closeGroup()
  return groups
}

/**
 * castModel.ts — the cast contract and the union, with no I/O.
 *
 * Kept apart from `casts.ts` (which reads Firestore) so every view, export and test
 * can fold casts without touching Firebase. See `casts.ts` for what the docs are and
 * why the comic is the unit.
 */

// ─── the published contract ───────────────────────────────────────────────────

export type CastKind = 'named' | 'generalized' | 'shared'

export interface CastVersion {
  /** A stable id for the drawing (`rama-boy`), or `—` for a character with none yet. */
  stage: string
  label: string
  drawn: boolean
  /** Described in the page prompt by design (stock extras) — not art anybody owes. */
  text?: boolean
  /** Full-resolution sheet. */
  key?: string
  /** 800 px JPEG for the grid. */
  thumb?: string
  /** 1600 px JPEG the character PDF embeds as it is. */
  print?: string
  bytes?: number
  printBytes?: number
  look?: string
  /** Borrowed from the line's cast library for a book that was not drawn with it. */
  fromLibrary?: boolean
  pages: number[]
}

export interface CastPerson {
  id: string
  line: string
  name: string
  kind: CastKind
  role?: string
  tier?: string
  spoken?: number
  /** Library entries only: the programmes this character's books belong to. */
  programs?: string[]
  pages: number[]
  versions: CastVersion[]
}

export interface CastCounts {
  characters: number
  named: number
  generalized: number
  shared: number
  drawn: number
  undrawn: number
  textOnly?: number
  versions: number
  versionsDrawn: number
  versionsOwed?: number
}

export interface CastDoc {
  comicId: string
  line: string
  slug: string
  title: string
  subject_slug: string
  program_slug: string
  library: boolean
  source: string
  generatedAt?: string
  counts: CastCounts
  people: CastPerson[]
}

// ─── the union ────────────────────────────────────────────────────────────────

export interface WorkAppearance {
  comicId: string
  line: string
  slug: string
  title: string
  pages: number[]
}

export interface WorkVersion extends CastVersion {
  /** Stable across the union: `line/id#stage`. */
  uid: string
  /** Each book that stages this version, with its pages there. Empty for a library sheet. */
  comics: WorkAppearance[]
  /** Drawn for the cast and staged on no page yet. */
  unstaged?: boolean
}

export type CharacterStatus = 'drawn' | 'partial' | 'undrawn' | 'text'

export interface WorkCharacter {
  /** `line/id` */
  uid: string
  id: string
  line: string
  name: string
  kind: CastKind
  role?: string
  spoken: number
  comics: WorkAppearance[]
  /** Page appearances summed over every book (a page counted once per book). */
  appearances: number
  versions: WorkVersion[]
  status: CharacterStatus
}

export function characterUid(p: Pick<CastPerson, 'line' | 'id'>): string {
  return `${p.line}/${p.id}`
}

export function versionUid(p: Pick<CastPerson, 'line' | 'id'>, v: Pick<CastVersion, 'stage'>): string {
  return `${p.line}/${p.id}#${v.stage}`
}

const KIND_ORDER: Record<CastKind, number> = { named: 0, shared: 1, generalized: 2 }

function statusOf(versions: CastVersion[]): CharacterStatus {
  const drawn = versions.filter((v) => v.drawn).length
  const owed = versions.filter((v) => !v.drawn && !v.text).length
  if (drawn && !owed) return 'drawn'
  if (drawn && owed) return 'partial'
  if (!drawn && !owed && versions.length) return 'text'
  return 'undrawn'
}

/**
 * Fold casts into one list of characters.
 *
 * `program` keeps only the library entries tagged with that programme (a programme
 * page); with no programme every library entry is kept (the repo-wide page). A
 * person's book-level pages are kept per book, never summed into one page list —
 * page 12 of one book is not page 12 of another.
 */
export function mergeCasts(docs: CastDoc[], opts: { program?: string } = {}): WorkCharacter[] {
  const byUid = new Map<string, WorkCharacter & { _v: Map<string, WorkVersion>; _c: Map<string, WorkAppearance> }>()
  for (const d of docs) {
    if (!d?.people) continue
    for (const p of d.people) {
      if (d.library && opts.program && !(p.programs ?? []).includes(opts.program)) continue
      const uid = characterUid(p)
      let w = byUid.get(uid)
      if (!w) {
        w = {
          uid, id: p.id, line: p.line, name: p.name, kind: p.kind, role: p.role, spoken: 0,
          comics: [], appearances: 0, versions: [], status: 'undrawn',
          _v: new Map(), _c: new Map(),
        }
        byUid.set(uid, w)
      }
      // A named entry outranks a generalised one for the same identity, and a real
      // name outranks a missing one; the first role line wins.
      if (KIND_ORDER[p.kind] < KIND_ORDER[w.kind]) w.kind = p.kind
      if (!w.name && p.name) w.name = p.name
      if (!w.role && p.role) w.role = p.role
      w.spoken += p.spoken ?? 0
      if (!d.library) {
        const app = w._c.get(d.comicId) ?? { comicId: d.comicId, line: d.line, slug: d.slug, title: d.title, pages: [] }
        app.pages = Array.from(new Set([...app.pages, ...(p.pages ?? [])])).sort((a, b) => a - b)
        w._c.set(d.comicId, app)
      }
      for (const v of p.versions ?? []) {
        const vuid = versionUid(p, v)
        let wv = w._v.get(vuid)
        if (!wv) {
          wv = { ...v, uid: vuid, pages: [], comics: [], unstaged: d.library ? true : undefined,
            fromLibrary: v.fromLibrary || undefined }
          w._v.set(vuid, wv)
        }
        wv.drawn = wv.drawn || v.drawn
        wv.key = wv.key ?? v.key
        wv.thumb = wv.thumb ?? v.thumb
        wv.bytes = wv.bytes ?? v.bytes
        wv.print = wv.print ?? v.print
        wv.printBytes = wv.printBytes ?? v.printBytes
        wv.look = wv.look ?? v.look
        // Borrowed only while EVERY book that holds it borrowed it: a sheet that one
        // book stages for real is that book's drawing, whoever else borrows it.
        wv.fromLibrary = !!wv.fromLibrary && !!v.fromLibrary ? true : undefined
        if (/\s*\(cast library\)$/.test(wv.label) && !/\(cast library\)$/.test(v.label)) wv.label = v.label
        if (!d.library) {
          wv.unstaged = undefined
          wv.comics.push({ comicId: d.comicId, line: d.line, slug: d.slug, title: d.title, pages: v.pages ?? [] })
        }
      }
    }
  }
  const out: WorkCharacter[] = []
  for (const w of byUid.values()) {
    const versions = Array.from(w._v.values())
    // A placeholder ("—") is only meaningful when nothing else is known about them.
    const real = versions.filter((v) => v.stage !== '—')
    const keep = real.length ? real : versions
    keep.sort((a, b) =>
      Number(b.drawn) - Number(a.drawn)
      || Number(!!a.text) - Number(!!b.text)
      || Number(!!a.unstaged) - Number(!!b.unstaged)
      || sumPages(b) - sumPages(a)
      || a.label.localeCompare(b.label))
    const comics = Array.from(w._c.values()).sort((a, b) => a.title.localeCompare(b.title))
    out.push({
      uid: w.uid, id: w.id, line: w.line, name: w.name, kind: w.kind, role: w.role, spoken: w.spoken,
      comics, appearances: comics.reduce((n, c) => n + c.pages.length, 0),
      versions: keep, status: statusOf(keep),
    })
  }
  return out.sort((a, b) =>
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || b.appearances - a.appearances
    || b.spoken - a.spoken
    || a.name.localeCompare(b.name))
}

function sumPages(v: WorkVersion): number {
  return v.comics.reduce((n, c) => n + c.pages.length, 0)
}

// ─── filtering and totals ─────────────────────────────────────────────────────

export type CastFilter = 'all' | 'drawn' | 'undrawn' | 'generalized'

/** Drawn = has art; not drawn yet = something still owed; generalised = the walk-ons. */
export function matchesFilter(c: WorkCharacter, f: CastFilter): boolean {
  if (f === 'all') return true
  if (f === 'generalized') return c.kind === 'generalized'
  if (f === 'drawn') return c.status === 'drawn' || c.status === 'partial'
  return c.status === 'undrawn' || c.status === 'partial'
}

export function filterCharacters(
  chars: WorkCharacter[],
  { filter = 'all', q = '', line = 'all' }: { filter?: CastFilter; q?: string; line?: string } = {},
): WorkCharacter[] {
  const needle = q.trim().toLowerCase()
  return chars.filter((c) =>
    matchesFilter(c, filter)
    && (line === 'all' || c.line === line || (c.line === 'shared' && c.comics.some((a) => a.line === line)))
    && (!needle || `${c.name} ${c.id} ${c.role ?? ''}`.toLowerCase().includes(needle)))
}

export interface CastTotals {
  characters: number
  drawn: number
  undrawn: number
  generalized: number
  versions: number
  versionsDrawn: number
  versionsOwed: number
  /** Stock extras whose look lives in the page prompt: neither drawn nor owed. */
  versionsText: number
  bytesDrawn: number
  comics: number
}

export function castTotals(chars: WorkCharacter[]): CastTotals {
  const comics = new Set<string>()
  const t: CastTotals = {
    characters: chars.length, drawn: 0, undrawn: 0, generalized: 0,
    versions: 0, versionsDrawn: 0, versionsOwed: 0, versionsText: 0, bytesDrawn: 0, comics: 0,
  }
  for (const c of chars) {
    if (c.kind === 'generalized') t.generalized += 1
    if (c.status === 'drawn' || c.status === 'partial') t.drawn += 1
    if (c.status === 'undrawn' || c.status === 'partial') t.undrawn += 1
    for (const a of c.comics) comics.add(a.comicId)
    for (const v of c.versions) {
      t.versions += 1
      if (v.drawn) { t.versionsDrawn += 1; t.bytesDrawn += v.bytes ?? 0 }
      else if (v.text) t.versionsText += 1
      else t.versionsOwed += 1
    }
  }
  t.comics = comics.size
  return t
}

/** Every downloadable version among `chars`. */
export function drawnVersions(chars: WorkCharacter[]): { character: WorkCharacter; version: WorkVersion }[] {
  const out: { character: WorkCharacter; version: WorkVersion }[] = []
  for (const c of chars) for (const v of c.versions) if (v.drawn && v.key) out.push({ character: c, version: v })
  return out
}

/** The lines present, in a stable order, for the line filter on the repo-wide page. */
export function linesOf(chars: WorkCharacter[]): string[] {
  const seen = new Set<string>()
  for (const c of chars) {
    if (c.line === 'shared') for (const a of c.comics) seen.add(a.line)
    else seen.add(c.line)
  }
  return Array.from(seen).sort()
}

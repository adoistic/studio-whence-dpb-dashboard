'use client'

/**
 * CharacterRoster — every character in the studio, on one page.
 *
 * `CharacterGrid` shows ONE comic's cast. This is the repo-wide view: the whole
 * roster for the surface being browsed, drawn and undrawn together, filterable
 * by line and by whether the art exists yet.
 *
 * It is an ART BUILD LIST first and a gallery second. 681 of the 1,168
 * characters have no art at all, so an undrawn version renders as a labelled
 * placeholder naming the comics and page count waiting on it — never as a gap
 * in the grid. A roster that quietly drops what is missing reads as finished,
 * which is the opposite of what it is opened for.
 *
 * No artwork ships in this public repo: every sheet is an R2 key resolved to a
 * short-lived presigned URL at render time, through the same gated channel as
 * the rest of the app.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useResolved } from '@/lib/useResolved'
import { resolveUrls } from '@/lib/dataApi'
import {
  characterId,
  rosterTotals,
  selectCharacters,
  versionKeys,
  type CharacterFilters,
  type DrawnFilter,
  type RosterDoc,
  type RosterPerson,
  type RosterVersion,
} from '@/lib/characters'
import type { Surface } from '@/lib/surface'

/** How many characters render at once. A line of 795 cannot all mount: each
 *  one carries several image cards, and every drawn key costs a presign. */
const PAGE_SIZE = 24

const DRAWN_FILTERS: { key: DrawnFilter; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'drawn', label: 'Drawn' },
  { key: 'owed', label: 'Still to draw' },
]

function prettyStage(stage: string): string {
  return stage === '—' || !stage ? 'no version yet' : stage.replace(/-/g, ' ')
}

/** "p3, p12, p40", capped so a lead's forty pages don't swamp the card. */
function pageList(pages: number[] | undefined): string | null {
  if (!pages?.length) return null
  const head = pages.slice(0, 8).map((p) => `p${p}`).join(', ')
  return pages.length > 8 ? `${head} +${pages.length - 8} more` : head
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many
}

/** Same shape as every other download in this app — no extra dependency. */
function saveBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}

export function CharacterRoster({
  rosters,
  surface,
  lineTitles = {},
}: {
  rosters: RosterDoc[] | null
  surface: Surface | null
  /** line slug → display title, for the filter pills and the line badges. */
  lineTitles?: Record<string, string>
}) {
  const [line, setLine] = useState('all')
  const [drawn, setDrawn] = useState<DrawnFilter>('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const filters: CharacterFilters = { line, drawn, q: query }
  const people = useMemo(
    () => selectCharacters(rosters, surface, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosters, surface, line, drawn, query],
  )
  const totals = useMemo(() => rosterTotals(people), [people])

  // Only the lines actually present on THIS surface get a filter pill — the
  // manga rosters are never even read here, so they can never offer one.
  const lines = useMemo(() => {
    const seen: string[] = []
    for (const p of selectCharacters(rosters, surface)) {
      if (!seen.includes(p.line)) seen.push(p.line)
    }
    return seen
  }, [rosters, surface])

  const shown = people.slice(0, limit)
  // Resolve only what is mounted. Resolving all 487 drawn keys up front would
  // be ten presign round-trips and half a gigabyte of turnarounds.
  const keys = useMemo(() => versionKeys(shown), [shown])
  const urls = useResolved(keys)

  function change(fn: () => void) {
    fn()
    setLimit(PAGE_SIZE)
  }

  const PILL =
    'rounded-full border px-3 py-1 font-sans text-[0.68rem] uppercase tracking-label transition-colors'
  const on = 'border-brand-indigo bg-brand-indigo text-white'
  const off = 'border-brand-pale-dusk text-brand-slate hover:border-brand-indigo'

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-serif text-brand-umber">
            {totals.characters} {plural(totals.characters, 'character')} ·{' '}
            {totals.versionsDrawn} of {totals.versions} {plural(totals.versions, 'version')} drawn
            {totals.owed > 0 && (
              <span className="text-brand-slate"> · {totals.owed} with no art yet</span>
            )}
          </p>
          <p className="mt-1 font-sans text-[0.68rem] uppercase tracking-label text-brand-slate">
            across {totals.comics} {plural(totals.comics, 'comic')}
          </p>
        </div>
        <RosterExports people={people} urls={urls} />
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-y border-brand-pale-dusk py-4">
        {lines.length > 1 && (
          <div role="group" aria-label="Filter by line" className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={line === 'all'}
              onClick={() => change(() => setLine('all'))}
              className={`${PILL} ${line === 'all' ? on : off}`}
            >
              All lines
            </button>
            {lines.map((slug) => (
              <button
                key={slug}
                type="button"
                aria-pressed={line === slug}
                onClick={() => change(() => setLine(slug))}
                className={`${PILL} ${line === slug ? on : off}`}
              >
                {lineTitles[slug] ?? slug}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter by art status" className="flex flex-wrap gap-2">
            {DRAWN_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={drawn === f.key}
                onClick={() => change(() => setDrawn(f.key))}
                className={`${PILL} ${drawn === f.key ? on : off}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => change(() => setQuery(e.target.value))}
            placeholder="Find a character…"
            aria-label="Find a character"
            className="ml-auto w-64 rounded-md border border-brand-pale-dusk px-3 py-1.5 font-serif text-sm text-brand-indigo outline-none focus:border-brand-indigo"
          />
        </div>
      </div>

      {/* ── The roster ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-10">
        {shown.map((person) => (
          <PersonRow
            key={characterId(person)}
            person={person}
            urls={urls}
            lineTitle={lineTitles[person.line] ?? person.line}
          />
        ))}
        {people.length === 0 && (
          <p className="font-serif text-brand-slate">No character matches that.</p>
        )}
      </div>

      {shown.length < people.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="mx-auto rounded-md border border-brand-pale-dusk px-5 py-2 font-sans text-[0.68rem] uppercase tracking-label text-brand-slate transition-colors hover:border-brand-indigo hover:text-brand-indigo"
        >
          Show more — {people.length - shown.length} to go
        </button>
      )}
    </div>
  )
}

function PersonRow({
  person,
  urls,
  lineTitle,
}: {
  person: RosterPerson
  urls: Record<string, string>
  lineTitle: string
}) {
  const owed = person.versions.filter((v) => !v.drawn).length
  return (
    <article className="border-t border-brand-pale-dusk pt-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-serif text-xl text-brand-indigo">{person.name}</h2>
        {/* The line is part of the character's identity, not decoration: the
            manga Ram and the Indic Ram are two different characters. */}
        <span className="font-sans text-[0.68rem] uppercase tracking-label text-brand-gold">
          {lineTitle}
        </span>
        <span className="font-serif text-sm text-brand-slate">
          {person.versions.length} {plural(person.versions.length, 'version')}
          {owed > 0 && ` · ${owed} still to draw`}
        </span>
        {person.pages > 0 && (
          <span className="font-serif text-sm text-brand-slate">
            {person.pages} {plural(person.pages, 'page')}
          </span>
        )}
      </header>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {person.versions.map((v, i) => (
          <VersionCard key={`${v.stage}-${i}`} person={person} version={v} urls={urls} />
        ))}
        {person.versions.length === 0 && (
          <p className="font-serif text-sm text-brand-slate">No version listed yet.</p>
        )}
      </div>
    </article>
  )
}

function VersionCard({
  person,
  version,
  urls,
}: {
  person: RosterPerson
  version: RosterVersion
  urls: Record<string, string>
}) {
  const url = version.key ? urls[version.key] : undefined
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-md border border-brand-pale-dusk bg-white">
        {url ? (
          // Presigned R2 URLs expire and are per-request, so next/image cannot
          // optimise them and this is a static export with no image server.
          // Same call as ComicReader and VariationGallery.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`${person.name} — ${prettyStage(version.stage)}`}
            className="h-full w-full object-contain"
          />
        ) : version.drawn ? (
          <span className="font-serif text-sm text-brand-slate">loading…</span>
        ) : (
          /* NOT DRAWN YET. Said plainly rather than left blank — the gap is
             the useful information on this card. */
          <span className="px-4 text-center font-serif text-sm text-brand-slate">
            Not drawn yet
            <span className="mt-1 block font-sans text-[0.62rem] uppercase tracking-label text-brand-slate/60">
              placeholder
            </span>
          </span>
        )}
      </div>

      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="font-sans text-[0.68rem] uppercase tracking-label text-brand-indigo">
          {prettyStage(version.stage)}
        </span>
        {url && (
          <a
            href={url}
            download={`${person.slug}--${version.stage}.png`}
            className="font-sans text-[0.66rem] uppercase tracking-label text-brand-slate underline decoration-brand-pale-dusk underline-offset-4 hover:text-brand-indigo"
          >
            PNG
          </a>
        )}
      </figcaption>

      {/* What is waiting on this version — the reason the placeholder is here. */}
      {version.pages > 0 && (
        <span className="font-serif text-xs text-brand-slate">
          {version.pages} {plural(version.pages, 'page')} waiting
        </span>
      )}
      {(version.comics ?? []).length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {version.comics.map((c) => (
            <li key={c.slug} className="font-serif text-xs text-brand-slate">
              <Link
                href={`/${person.line}/${c.slug}`}
                className="underline decoration-brand-pale-dusk underline-offset-4 hover:text-brand-indigo"
              >
                {c.title || c.slug}
              </Link>
              {pageList(c.pages) && <span> — {pageList(c.pages)}</span>}
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}

/**
 * PDF of the whole filtered roster, or a ZIP of every sheet with a README that
 * names the versions still to draw. Same shape as CharacterGrid's exports; the
 * difference is scope — everything currently filtered in, not one comic — so
 * the keys are presigned on demand rather than read off the mounted page.
 */
function RosterExports({
  people,
  urls,
}: {
  people: RosterPerson[]
  urls: Record<string, string>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const totals = rosterTotals(people)

  /** The mounted map, topped up with a presign for everything not yet resolved. */
  async function allUrls(): Promise<Record<string, string>> {
    const missing = versionKeys(people).filter((k) => !urls[k])
    if (missing.length === 0) return urls
    try {
      return { ...urls, ...(await resolveUrls(missing)) }
    } catch {
      // A failed presign degrades to "not drawn yet" in the output rather than
      // failing the whole export.
      return urls
    }
  }

  async function bundle() {
    setBusy('zip')
    try {
      const [{ default: JSZip }, resolved] = await Promise.all([import('jszip'), allUrls()])
      const zip = new JSZip()
      const md: string[] = [
        '# Studio Whence — character roster',
        '',
        `${totals.characters} characters · ${totals.versionsDrawn} of ${totals.versions} versions drawn` +
          (totals.owed ? ` · ${totals.owed} with no art yet` : ''),
        '',
        'One folder per character, keyed by line — the same character name under',
        'two lines is two different characters. A version listed with no file is',
        'one a book needs and nobody has drawn yet.',
        '',
      ]
      for (const p of people) {
        md.push(`## ${p.name} — ${p.line}`)
        md.push('')
        if (p.pages) md.push(`- ${p.pages} pages across ${p.comics.length} comics`)
        for (const v of p.versions) {
          const file = `${p.line}/${p.slug}/${v.stage}.png`
          const waiting = v.pages ? ` — ${v.pages} pages` : ''
          const url = v.key ? resolved[v.key] : undefined
          if (url) {
            md.push(`  - \`${file}\` — ${prettyStage(v.stage)}${waiting}`)
            try {
              zip.file(file, await (await fetch(url)).blob())
            } catch {
              // Keep the manifest honest and carry on.
              md.push('    (image could not be fetched)')
            }
          } else {
            md.push(`  - ${prettyStage(v.stage)}${waiting} — NOT DRAWN YET`)
          }
        }
        md.push('')
      }
      zip.file('README.md', md.join('\n'))
      saveBlob(await zip.generateAsync({ type: 'blob' }), 'studio-whence-characters.zip')
    } finally {
      setBusy(null)
    }
  }

  async function pdf() {
    setBusy('pdf')
    try {
      const [{ PDFDocument, StandardFonts, rgb }, resolved] = await Promise.all([
        import('pdf-lib'),
        allUrls(),
      ])
      const doc = await PDFDocument.create()
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const bold = await doc.embedFont(StandardFonts.HelveticaBold)
      for (const p of people) {
        for (const v of p.versions) {
          const page = doc.addPage([842, 595]) // A4 landscape, as the character book
          page.drawText(p.name, { x: 40, y: 540, size: 22, font: bold, color: rgb(0.1, 0.1, 0.2) })
          page.drawText(prettyStage(v.stage).toUpperCase(), {
            x: 42 + bold.widthOfTextAtSize(p.name, 22),
            y: 543,
            size: 11,
            font,
            color: rgb(0.45, 0.45, 0.5),
          })
          const meta = [
            p.line,
            v.pages ? `${v.pages} pages` : '',
            (v.comics ?? []).map((c) => c.title || c.slug).join(', '),
          ]
            .filter(Boolean)
            .join('  ·  ')
          page.drawText(meta.slice(0, 160), { x: 40, y: 522, size: 9, font, color: rgb(0.45, 0.45, 0.5) })
          const url = v.key ? resolved[v.key] : undefined
          if (url) {
            const bytes = await (await fetch(url)).arrayBuffer().catch(() => null)
            const img = bytes ? await doc.embedPng(bytes).catch(() => null) : null
            if (img) {
              const s = Math.min(762 / img.width, 450 / img.height)
              page.drawImage(img, {
                x: (842 - img.width * s) / 2,
                y: 40,
                width: img.width * s,
                height: img.height * s,
              })
            }
          } else {
            page.drawText('Not drawn yet', { x: 40, y: 300, size: 16, font, color: rgb(0.6, 0.6, 0.65) })
          }
        }
      }
      const bytes = await doc.save()
      const buf = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(buf).set(bytes)
      saveBlob(new Blob([buf], { type: 'application/pdf' }), 'studio-whence-characters.pdf')
    } finally {
      setBusy(null)
    }
  }

  const BTN =
    'rounded-md border border-brand-pale-dusk px-3 py-1.5 font-sans text-[0.68rem] uppercase tracking-label text-brand-slate transition-colors hover:border-brand-indigo hover:text-brand-indigo disabled:opacity-50'

  if (people.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={pdf} disabled={busy !== null} className={BTN}>
        {busy === 'pdf' ? 'Building PDF…' : `Download PDF — ${totals.versions} versions`}
      </button>
      <button type="button" onClick={bundle} disabled={busy !== null} className={BTN}>
        {busy === 'zip' ? 'Building ZIP…' : 'PNG bundle + README'}
      </button>
    </div>
  )
}

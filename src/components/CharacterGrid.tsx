'use client'

/**
 * CharacterGrid — a comic's whole cast, every version, placeholders included.
 *
 * The third tab beside Research and Comics. It shows every character the comic
 * stages — the lead, the named supporting cast, and the unnamed roles that
 * carry real dialogue — with each life stage or costume version drawn for them.
 *
 * A version the book NEEDS and nobody has drawn yet is shown as a labelled
 * placeholder, not omitted. A cast sheet that quietly drops what is missing
 * reads as complete, which is the opposite of what an editor opens it for.
 *
 * Everything is served gated: the sheets are R2 keys resolved to short-lived
 * presigned URLs at render time, so no artwork ships in this public repo.
 */

import { useMemo, useState } from 'react'
import type { Comic } from '@/types/content'
import { useResolved } from '@/lib/useResolved'

type Person = NonNullable<Comic['characters']>['people'][number]

const TIER_LABEL: Record<string, string> = {
  LEAD: 'Lead', A: 'Major', B: 'Supporting', C: 'Minor', D: 'Walk-on',
}

function prettyStage(s: string) {
  return s === '—' ? 'no version yet' : s.replace(/-/g, ' ')
}

/** Same shape as every other download in this app — no extra dependency. */
function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}

/** Pages a version appears on, as "p3, p12, p40" — capped so a lead's list of
 *  forty pages does not swamp the card it sits in. */
function pageList(pages: number[]) {
  if (!pages.length) return null
  const head = pages.slice(0, 8).map((p) => `p${p}`).join(', ')
  return pages.length > 8 ? `${head} +${pages.length - 8} more` : head
}

export function CharacterGrid({ comic }: { comic: Comic }) {
  const cast = comic.characters
  const [tier, setTier] = useState<string>('all')
  const [query, setQuery] = useState('')

  const keys = useMemo(
    () => (cast?.people ?? []).flatMap((p) => p.versions.map((v) => v.key).filter(Boolean) as string[]),
    [cast],
  )
  const urls = useResolved(keys)

  if (!cast || !cast.people.length) return null

  const tiers = ['all', ...Array.from(new Set(cast.people.map((p) => p.tier)))]
  const people = cast.people.filter((p) => {
    if (tier !== 'all' && p.tier !== tier) return false
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return p.name.toLowerCase().includes(q) || p.tag.toLowerCase().includes(q)
  })

  return (
    <section className="flex flex-col gap-8 pt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-light text-brand-indigo">The cast</h2>
          <p className="mt-2 font-serif text-brand-umber">
            {cast.count} characters · {cast.drawn} versions drawn
            {cast.owed > 0 && (
              <span className="text-brand-slate"> · {cast.owed} still to draw</span>
            )}
          </p>
        </div>
        <CharacterExports comic={comic} urls={urls} />
      </div>

      {/* Filters — a 27-person cast needs them, a 3-person one does not */}
      {cast.people.length > 8 && (
        <div className="flex flex-wrap items-center gap-3">
          {tiers.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={`rounded-full border px-3 py-1 font-sans text-[0.68rem] uppercase tracking-label transition-colors ${
                tier === t
                  ? 'border-brand-indigo bg-brand-indigo text-white'
                  : 'border-brand-pale-dusk text-brand-slate hover:border-brand-indigo'
              }`}
            >
              {t === 'all' ? 'Everyone' : TIER_LABEL[t] ?? t}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a character…"
            aria-label="Find a character"
            className="ml-auto w-56 rounded-md border border-brand-pale-dusk px-3 py-1.5 font-serif text-sm text-brand-indigo outline-none focus:border-brand-indigo"
          />
        </div>
      )}

      <div className="flex flex-col gap-10">
        {people.map((p) => (
          <PersonRow key={p.slug} person={p} urls={urls} />
        ))}
        {!people.length && (
          <p className="font-serif text-brand-slate">No character matches that.</p>
        )}
      </div>
    </section>
  )
}

function PersonRow({ person, urls }: { person: Person; urls: Record<string, string> }) {
  return (
    <article className="border-t border-brand-pale-dusk pt-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="font-serif text-xl text-brand-indigo">{person.name}</h3>
        {person.tag && person.tag.toLowerCase() !== person.name.toLowerCase() && (
          <span className="font-sans text-[0.68rem] uppercase tracking-label text-brand-gold">
            {person.tag}
          </span>
        )}
        <span className="font-sans text-[0.68rem] uppercase tracking-label text-brand-slate">
          {TIER_LABEL[person.tier] ?? person.tier}
        </span>
        {person.lines > 0 && (
          <span className="font-serif text-sm text-brand-slate">
            {person.lines} spoken {person.lines === 1 ? 'line' : 'lines'}
          </span>
        )}
        {pageList(person.pages) && (
          <span className="font-serif text-sm text-brand-slate">{pageList(person.pages)}</span>
        )}
      </header>
      {person.desc && (
        <p className="mt-2 max-w-3xl font-serif text-brand-umber">{person.desc}</p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {person.versions.map((v) => {
          const url = v.key ? urls[v.key] : undefined
          return (
            <figure key={v.stage} className="flex flex-col gap-2">
              <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-md border border-brand-pale-dusk bg-white">
                {url ? (
                  <img
                    src={url}
                    alt={`${person.name} — ${prettyStage(v.stage)}`}
                    className="h-full w-full object-contain"
                  />
                ) : v.drawn ? (
                  <span className="font-serif text-sm text-brand-slate">loading…</span>
                ) : (
                  /* NOT DRAWN YET. Said plainly rather than left blank — the gap
                     is the useful information on this card. */
                  <span className="px-4 text-center font-serif text-sm text-brand-slate">
                    Not drawn yet
                    <span className="mt-1 block font-sans text-[0.62rem] uppercase tracking-label text-brand-pale-dusk">
                      placeholder
                    </span>
                  </span>
                )}
              </div>
              <figcaption className="flex items-baseline justify-between gap-2">
                <span className="font-sans text-[0.68rem] uppercase tracking-label text-brand-indigo">
                  {prettyStage(v.stage)}
                </span>
                {url && (
                  <a
                    href={url}
                    download={`${person.slug}--${v.stage}.png`}
                    className="font-sans text-[0.66rem] uppercase tracking-label text-brand-slate underline decoration-brand-pale-dusk underline-offset-4 hover:text-brand-indigo"
                  >
                    PNG
                  </a>
                )}
              </figcaption>
              {pageList(v.pages) && (
                <span className="font-serif text-xs text-brand-slate">{pageList(v.pages)}</span>
              )}
            </figure>
          )
        })}
      </div>
    </article>
  )
}

/** PDF of the whole cast, or a ZIP of every sheet with a README naming them. */
function CharacterExports({ comic, urls }: { comic: Comic; urls: Record<string, string> }) {
  const [busy, setBusy] = useState<string | null>(null)
  const cast = comic.characters
  if (!cast) return null
  const { count, drawn, owed, people } = cast

  async function bundle() {
    setBusy('zip')
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const lines: string[] = [
        `# ${comic.title} — character sheets`,
        '',
        `${count} characters · ${drawn} versions drawn` +
          (owed ? ` · ${owed} still to draw` : ''),
        '',
        'One folder per character. A version listed here with no file is one the',
        'book needs and nobody has drawn yet.',
        '',
      ]
      for (const p of people) {
        lines.push(`## ${p.name}${p.tag && p.tag !== p.name ? ` (script tag: ${p.tag})` : ''}`)
        lines.push('')
        lines.push(`- role: ${TIER_LABEL[p.tier] ?? p.tier}`)
        if (p.lines) lines.push(`- spoken lines: ${p.lines}`)
        if (p.pages.length) lines.push(`- appears on: ${p.pages.map((n) => `p${n}`).join(', ')}`)
        if (p.desc) lines.push(`- ${p.desc}`)
        lines.push('')
        for (const v of p.versions) {
          const file = `${p.slug}/${v.stage}.png`
          const where = v.pages.length ? ` — ${v.pages.map((n) => `p${n}`).join(', ')}` : ''
          if (v.key && urls[v.key]) {
            lines.push(`  - \`${file}\` — ${prettyStage(v.stage)}${where}`)
            const res = await fetch(urls[v.key]!)
            zip.file(file, await res.blob())
          } else {
            lines.push(`  - ${prettyStage(v.stage)}${where} — NOT DRAWN YET`)
          }
        }
        lines.push('')
      }
      zip.file('README.md', lines.join('\n'))
      saveBlob(await zip.generateAsync({ type: 'blob' }), `${comic.slug}-characters.zip`)
    } finally {
      setBusy(null)
    }
  }

  async function pdf() {
    setBusy('pdf')
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const bold = await doc.embedFont(StandardFonts.HelveticaBold)
      for (const p of people) {
        for (const v of p.versions) {
          const page = doc.addPage([842, 595]) // A4 landscape, matching the character book
          page.drawText(p.name, { x: 40, y: 540, size: 22, font: bold, color: rgb(0.1, 0.1, 0.2) })
          page.drawText(prettyStage(v.stage).toUpperCase(), {
            x: 42 + bold.widthOfTextAtSize(p.name, 22), y: 543, size: 11, font,
            color: rgb(0.45, 0.45, 0.5),
          })
          const meta = [TIER_LABEL[p.tier] ?? p.tier,
            p.lines ? `${p.lines} spoken lines` : '',
            pageList(v.pages) ?? ''].filter(Boolean).join('  ·  ')
          page.drawText(meta, { x: 40, y: 522, size: 9, font, color: rgb(0.45, 0.45, 0.5) })
          if (v.key && urls[v.key]) {
            const bytes = await (await fetch(urls[v.key]!)).arrayBuffer()
            const img = await doc.embedPng(bytes).catch(() => null)
            if (img) {
              const maxW = 762, maxH = 450
              const s = Math.min(maxW / img.width, maxH / img.height)
              page.drawImage(img, {
                x: (842 - img.width * s) / 2, y: 40,
                width: img.width * s, height: img.height * s,
              })
            }
          } else {
            page.drawText('Not drawn yet', {
              x: 40, y: 300, size: 16, font, color: rgb(0.6, 0.6, 0.65),
            })
          }
        }
      }
      const bytes = await doc.save()
      const buf = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(buf).set(bytes)
      saveBlob(new Blob([buf], { type: 'application/pdf' }),
        `${comic.slug}-characters.pdf`)
    } finally {
      setBusy(null)
    }
  }

  const BTN =
    'rounded-md border border-brand-pale-dusk px-3 py-1.5 font-sans text-[0.68rem] uppercase tracking-label text-brand-slate transition-colors hover:border-brand-indigo hover:text-brand-indigo disabled:opacity-50'

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={pdf} disabled={busy !== null} className={BTN}>
        {busy === 'pdf' ? 'Building PDF…' : 'Download PDF'}
      </button>
      <button type="button" onClick={bundle} disabled={busy !== null} className={BTN}>
        {busy === 'zip' ? 'Building ZIP…' : 'PNG bundle + README'}
      </button>
    </div>
  )
}

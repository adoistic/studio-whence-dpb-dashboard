'use client'

import { useMemo, useRef, useState } from 'react'
import type { Comic } from '@/types/content'
import { useResolved } from '@/lib/useResolved'
import { SectionHead } from '@/components/SectionHead'
import { downloadKey } from '@/lib/downloadDoc'
import { languageLabel } from '@/lib/comicLanguages'
import {
  coverChoiceDocId, setOptionAsOfficial, uploadOfficialCover, useCoverChoice,
} from '@/lib/coverChoice'

interface Props {
  comic: Comic
  canModerate?: boolean
  author?: { email: string; name: string }
}

type CoverOption = NonNullable<Comic['coverOptions']>['options'][number]

/** English names beside the native label, so a reviewer who does not read
 *  Devanagari still knows which edition a section belongs to. */
const EDITION_NAME: Record<string, string> = { en: 'English edition', hi: 'Hindi edition' }

/** A blank plate is the cover art with no titling: published as `optN-clean`. */
export function isBlankPlate(o: CoverOption): boolean {
  return /-clean\.(png|jpe?g)$/i.test(o.key) || /clean plate|no titling|blank/i.test(o.label)
}

/**
 * "Cover options" gallery: the candidate front-cover designs for the editorial
 * team to review and choose. Image keys come from the gated `coverOptions`
 * catalog block and resolve to short-lived presigned R2 URLs through the same
 * /resolve channel as the reader. Renders nothing if the comic carries no
 * cover options.
 *
 * A book with a translated edition has a cover set per language. Every set is
 * shown at once, each in its own marked section, so a reviewer sees the English
 * and the Hindi covers side by side rather than one behind a toggle (Adnan,
 * 2 Oct 2026). Inside a section the titled covers come first and their blank
 * plates follow under their own heading. Each language keeps its own official
 * pick: choosing the Hindi cover never replaces the English one.
 */
export function CoverOptions({ comic, canModerate = false, author }: Props) {
  const co = comic.coverOptions
  const original = comic.originalLanguage ?? 'en'
  const allOptions = useMemo(() => co?.options ?? [], [co])
  // Languages present among the options, original first.
  const langs = useMemo(() => {
    const seen = [...new Set(allOptions.map((o) => o.lang ?? original))]
    if (seen.length === 0) seen.push(original)
    return seen.sort((a, b) => Number(b === original) - Number(a === original))
  }, [allOptions, original])

  if (allOptions.length === 0 && !canModerate) return null
  const multi = langs.length > 1

  return (
    <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHead kicker="Covers" title="Cover options" />
        {multi && (
          <nav aria-label="Cover editions" className="flex flex-wrap items-center gap-2 font-sans">
            {langs.map((code) => (
              <a
                key={code}
                href={`#covers-${code}`}
                className="rounded-full border border-brand-pale-dusk bg-brand-threshold/70 px-4 py-1.5 text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-indigo hover:text-brand-pale-dusk"
              >
                {languageLabel(code)}
              </a>
            ))}
          </nav>
        )}
      </div>
      <p className="font-serif text-brand-umber leading-relaxed">
        {allOptions.length === 0
          ? 'No candidate front-cover designs have been published yet.'
          : multi
            ? `This book has ${langs.length} editions, and each has its own covers. Review each set and pick one cover per edition.`
            : `Candidate front-cover designs${co?.language ? ` (${co.language})` : ''}. Review them and pick the one to take forward.`}
        {canModerate ? ' Set one below or upload your own reference.' : ''}
      </p>

      <div className="flex flex-col gap-12">
        {langs.map((code) => (
          <LanguageCovers
            key={code}
            comic={comic}
            lang={code}
            original={original}
            options={allOptions.filter((o) => (o.lang ?? original) === code)}
            framed={multi}
            canModerate={canModerate}
            author={author ?? { email: '', name: '' }}
          />
        ))}
      </div>
    </section>
  )
}

function LanguageCovers({
  comic, lang, original, options, framed, canModerate, author,
}: {
  comic: Comic
  lang: string
  original: string
  options: CoverOption[]
  framed: boolean
  canModerate: boolean
  author: { email: string; name: string }
}) {
  const comicId = `${comic.line}__${comic.slug}`
  const choiceId = coverChoiceDocId(comicId, lang, original)
  const { choice } = useCoverChoice(choiceId)
  const uploadedKey = choice?.source === 'upload' ? choice.key : null
  const titled = options.filter((o) => !isBlankPlate(o))
  const blanks = options.filter(isBlankPlate)
  const urls = useResolved([
    ...options.map((o) => o.key),
    ...(uploadedKey ? [uploadedKey] : []),
  ])
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const isOfficialOption = (key: string) => choice?.source === 'option' && choice.key === key
  const official = options.find((o) => isOfficialOption(o.key))
  const edition = EDITION_NAME[lang] ?? `${languageLabel(lang)} edition`

  async function onUpload(file: File) {
    if (!canModerate) return
    setBusy(true)
    try {
      await uploadOfficialCover(choiceId, { line: comic.line, slug: comic.slug }, file, author)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const grid = (list: CoverOption[]) => (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((o) => (
        <figure key={o.key} className="flex flex-col gap-3">
          <div className={`overflow-hidden rounded-brand border bg-brand-cream shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)] ${isOfficialOption(o.key) ? 'border-2 border-brand-indigo' : 'border-brand-pale-dusk'}`}>
            {urls[o.key] ? (
              <img src={urls[o.key]} alt={`Cover option — ${o.label}`} loading="lazy" className="block w-full" />
            ) : (
              <div className="aspect-[3/4] w-full animate-pulse bg-brand-threshold/60" />
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <figcaption className="font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate">
              {o.label}
              {isOfficialOption(o.key) && <span className="ml-2 text-brand-indigo">Official</span>}
            </figcaption>
            {canModerate && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {!isOfficialOption(o.key) && (
                  <button
                    type="button"
                    onClick={() => setOptionAsOfficial(choiceId, o, author)}
                    className="rounded-full border border-brand-indigo px-3 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-indigo hover:text-brand-cream"
                  >
                    Set official
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Download ${o.label}`}
                  onClick={() => downloadKey(o.key, `${comic.slug}-cover-${lang}-${o.label.toLowerCase().replace(/\s+/g, '-')}.png`)}
                  className="rounded-full border border-brand-pale-dusk px-3 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60"
                >
                  Download
                </button>
              </div>
            )}
          </div>
        </figure>
      ))}
    </div>
  )

  return (
    <div
      id={`covers-${lang}`}
      role="region"
      aria-label={`${edition} covers`}
      className={framed ? 'scroll-mt-24 overflow-hidden rounded-brand border-2 border-brand-indigo/25' : ''}
    >
      {framed && (
        <header className="flex flex-wrap items-center justify-between gap-3 bg-brand-indigo px-5 py-3 text-brand-pale-dusk">
          <h3 className="flex items-baseline gap-3">
            <span className="font-serif text-2xl leading-none">{languageLabel(lang)}</span>
            <span className="font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk/80">
              {edition} · {titled.length} {titled.length === 1 ? 'cover' : 'covers'}
            </span>
          </h3>
          <span className="font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-gold">
            {uploadedKey ? 'Official: uploaded cover' : official ? `Official: ${official.label}` : 'No official cover chosen yet'}
          </span>
        </header>
      )}

      <div className={`flex flex-col gap-8 ${framed ? 'p-5' : ''}`}>
        {uploadedKey && (
          <figure className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-brand border-2 border-brand-indigo bg-brand-cream shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)]">
              {urls[uploadedKey] ? (
                <img src={urls[uploadedKey]} alt={`Official ${edition} cover uploaded by the team`} className="block w-full" />
              ) : (
                <div className="aspect-[3/4] w-full animate-pulse bg-brand-threshold/60" />
              )}
            </div>
            <figcaption className="font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo">
              Official cover uploaded{choice?.setByName ? ` by ${choice.setByName}` : ''}
            </figcaption>
          </figure>
        )}

        {titled.length > 0 && grid(titled)}

        {blanks.length > 0 && (
          <div className="flex flex-col gap-4 border-t border-dashed border-brand-pale-dusk pt-6">
            <h4 className="font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate">
              Blank versions · the same art with no title, for your own titling
            </h4>
            {grid(blanks)}
          </div>
        )}

        {options.length === 0 && !uploadedKey && (
          <p className="font-serif text-brand-umber">No {edition.toLowerCase()} covers have been published yet.</p>
        )}

        {canModerate && (
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label={`Upload ${edition} reference`}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onUpload(file)
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-brand-pale-dusk px-4 py-2 font-sans text-[0.7rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60 disabled:opacity-50"
            >
              {busy ? 'Uploading...' : framed ? `Upload ${languageLabel(lang)} reference` : 'Upload reference'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

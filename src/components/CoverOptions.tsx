'use client'

import { useRef, useState } from 'react'
import type { Comic } from '@/types/content'
import { useResolved } from '@/lib/useResolved'
import { SectionHead } from '@/components/SectionHead'
import { downloadKey } from '@/lib/downloadDoc'
import { setOptionAsOfficial, uploadOfficialCover, useCoverChoice } from '@/lib/coverChoice'

interface Props {
  comic: Comic
  canModerate?: boolean
  author?: { email: string; name: string }
}

/**
 * "Cover options" gallery — shows the candidate front-cover designs (3 per comic)
 * for the editorial team to review and choose. Image keys come from the gated
 * `coverOptions` catalog block and are resolved to short-lived presigned R2 URLs
 * via the same /resolve channel as the reader. Renders nothing if the comic
 * carries no cover options.
 */
export function CoverOptions({ comic, canModerate = false, author }: Props) {
  const co = comic.coverOptions
  const options = co?.options ?? []
  const comicId = `${comic.line}__${comic.slug}`
  const { choice } = useCoverChoice(comicId)
  const uploadedKey = choice?.source === 'upload' ? choice.key : null
  const urls = useResolved([
    ...options.map((o) => o.key),
    ...(uploadedKey ? [uploadedKey] : []),
  ])
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  if (options.length === 0 && !uploadedKey && !canModerate) return null

  const coverAuthor = author ?? { email: '', name: '' }
  const isOfficialOption = (key: string) => choice?.source === 'option' && choice.key === key

  async function onUpload(file: File) {
    if (!canModerate) return
    setBusy(true)
    try {
      await uploadOfficialCover(comicId, { line: comic.line, slug: comic.slug }, file, coverAuthor)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
      <SectionHead kicker="Covers" title="Cover options" />
      <p className="font-serif text-brand-umber leading-relaxed">
        {options.length > 0
          ? `Candidate front-cover designs${co?.language ? ` (${co.language})` : ''} — review and pick the one to take forward.`
          : 'No candidate front-cover designs have been published yet.'}
        {canModerate ? ' Set one below or upload your own reference.' : ''}
      </p>

      {uploadedKey && (
        <figure className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-brand border-2 border-brand-indigo bg-brand-cream shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)]">
            {urls[uploadedKey] ? (
              <img src={urls[uploadedKey]} alt="Official cover uploaded by the team" className="block w-full" />
            ) : (
              <div className="aspect-[3/4] w-full animate-pulse bg-brand-threshold/60" />
            )}
          </div>
          <figcaption className="font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo">
            Official cover uploaded{choice?.setByName ? ` by ${choice.setByName}` : ''}
          </figcaption>
        </figure>
      )}

      {options.length > 0 && (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((o) => (
            <figure key={o.key} className="flex flex-col gap-3">
              <div className={`overflow-hidden rounded-brand border bg-brand-cream shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)] ${isOfficialOption(o.key) ? 'border-2 border-brand-indigo' : 'border-brand-pale-dusk'}`}>
                {urls[o.key] ? (
                  <img
                    src={urls[o.key]}
                    alt={`Cover option — ${o.label}`}
                    loading="lazy"
                    className="block w-full"
                  />
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
                        onClick={() => setOptionAsOfficial(comicId, o, coverAuthor)}
                        className="rounded-full border border-brand-indigo px-3 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-indigo hover:text-brand-cream"
                      >
                        Set official
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Download ${o.label}`}
                      onClick={() => downloadKey(o.key, `${comic.slug}-cover-${o.label.toLowerCase().replace(/\s+/g, '-')}.png`)}
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
      )}

      {canModerate && (
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
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
            {busy ? 'Uploading...' : 'Upload reference'}
          </button>
        </div>
      )}
    </section>
  )
}

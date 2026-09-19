'use client'

import { useEffect, useMemo, useState } from 'react'

import type { Comic } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { languageLabel } from '@/lib/comicLanguages'
import { useResolved } from '@/lib/useResolved'
import { downloadKey } from '@/lib/downloadDoc'

/**
 * DeckReader — READ the editable deck in the portal, in any published language.
 *
 * Adnan, 2026-09-19: "Right now, one is only able to see as well as comment on
 * the English version... They are only able to see the other version after
 * downloading and commenting on it. I'd rather have it like we have now for
 * script, where you are able to switch between that."
 *
 * The script reader has had a language switcher for a while; the deck had none,
 * because a .pptx cannot be shown in a browser. `tools/publish_deck_pdfs.py`
 * closes that by rendering every published deck to PDF, so this section is the
 * same switcher over a viewable artifact. Downloads stay in LanguageSection
 * below — this is for reading.
 *
 * A PDF is shown in an `<iframe>` rather than a JS viewer: every target browser
 * renders PDFs natively, and the alternative is shipping a renderer to display
 * something the browser already displays. The URL is a short-lived presigned
 * one from the gated /resolve route, so the bytes are never public and
 * `useResolved` re-resolves it before it expires under a long reading session.
 */
export function DeckReader({ comic }: { comic: Comic }) {
  const editions = useMemo(
    () => comic.deckPdf?.editions ?? [],
    [comic.deckPdf],
  )

  // Original first, so a book opens in the language it was written in — the
  // master is NOT always English (the legacy Yogi books are Hindi originals).
  const ordered = useMemo(() => {
    const original = (comic.originalLanguage ?? 'en').toLowerCase()
    const isOriginal = (name: string) =>
      name.toLowerCase().startsWith(original === 'hi' ? 'hind' : 'eng') ||
      name.toLowerCase() === original
    return [...editions].sort((a, b) =>
      Number(isOriginal(b.language)) - Number(isOriginal(a.language)))
  }, [editions, comic.originalLanguage])

  const languages = useMemo(
    () => ordered.map((e) => ({
      code: e.language,
      label: /hindi|हिंदी/i.test(e.language) ? languageLabel('hi') : e.language,
      draftKey: e.key,
      isOriginal: false,
    })),
    [ordered],
  )

  const [active, setActive] = useState<string>('')
  useEffect(() => {
    if (ordered.length > 0 && !ordered.some((e) => e.language === active)) {
      setActive(ordered[0].language)
    }
  }, [ordered, active])

  const current = ordered.find((e) => e.language === active) ?? ordered[0]
  // Resolve EVERY edition, not just the visible one, so switching language is
  // instant rather than a fresh round trip each time.
  const urls = useResolved(useMemo(() => ordered.map((e) => e.key), [ordered]))

  if (ordered.length === 0 || !current) return null
  const url = urls[current.key]

  return (
    <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHead kicker="Editable deck" title="Read the deck" />
        <div className="flex flex-wrap items-center gap-3">
          <LanguageSwitcher
            languages={languages}
            active={active}
            onChange={setActive}
          />
          <button
            type="button"
            onClick={() => downloadKey(
              current.key,
              `${comic.slug}-deck-${current.language.toLowerCase()}.pdf`,
            )}
            className="rounded-full border border-brand-pale-dusk px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate transition-colors hover:text-brand-indigo"
          >
            Download PDF
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-brand-pale-dusk bg-brand-threshold/40">
        {url ? (
          <iframe
            // Keying on the key remounts the frame on a language switch, which
            // is what makes the viewer jump back to page 1 of the new edition
            // instead of holding the previous one's scroll position.
            key={current.key}
            src={url}
            title={`${comic.title} — editable deck (${current.language})`}
            className="h-[85vh] w-full"
          />
        ) : (
          <div className="flex h-[85vh] items-center justify-center font-sans text-[0.8rem] text-brand-slate">
            Loading the {current.language} deck…
          </div>
        )}
      </div>
    </section>
  )
}

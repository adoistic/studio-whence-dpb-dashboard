'use client'

import { useEffect, useMemo, useState } from 'react'

import type { Comic } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'
import { PageFlipViewer } from '@/components/PageFlipViewer'
import { downloadKey } from '@/lib/downloadDoc'

/**
 * Read the editable deck, in any published language, exactly the way the comic
 * above it reads.
 *
 * Adnan asked for two things and they are both structural rather than cosmetic:
 * the deck reader must be the SAME UI as the comic reader, and it must sit
 * AFTER it. The first version embedded the deck's PDF in an iframe — same
 * content, but the browser's own PDF chrome, scrollbar and zoom inside a page
 * that otherwise pages through images. So the deck is now rasterised to page
 * images by `tools/publish_deck_pages.py` and shown through the same
 * PageFlipViewer, which means arrows, swipe, prefetch and fullscreen behave
 * identically and will keep behaving identically when either changes.
 *
 * The language pills sit in the section header, where the comic's own
 * Comic PDF / A+ Modules toggle sits, rather than being invented somewhere new.
 */
export function DeckReader({ comic }: { comic: Comic }) {
  const editions = useMemo(
    () => (comic.deckPages?.editions ?? []).filter((e) => (e.count ?? 0) > 0),
    [comic.deckPages],
  )

  // Original first: the master is not always English (the legacy Yogi books
  // are Hindi originals with English translations).
  const ordered = useMemo(() => {
    const original = (comic.originalLanguage ?? 'en').toLowerCase()
    const isOriginal = (e: { code?: string; language: string }) =>
      (e.code ?? '').toLowerCase() === original ||
      e.language.toLowerCase().startsWith(original === 'hi' ? 'hind' : 'eng')
    return [...editions].sort((a, b) => Number(isOriginal(b)) - Number(isOriginal(a)))
  }, [editions, comic.originalLanguage])

  const [active, setActive] = useState<string>('')
  useEffect(() => {
    if (ordered.length > 0 && !ordered.some((e) => e.language === active)) {
      setActive(ordered[0].language)
    }
  }, [ordered, active])

  const current = ordered.find((e) => e.language === active) ?? ordered[0]

  const keys = useMemo(() => {
    if (!current) return []
    const base = `images/comics/${comic.line}/${comic.slug}/deck/${current.code ?? 'en'}`
    return Array.from({ length: current.count ?? 0 },
      (_, n) => `${base}/web/page-${String(n + 1).padStart(2, '0')}.jpg`)
  }, [current, comic.line, comic.slug])

  const masterKeys = useMemo(() => keys.map((k) => k.replace('/web/', '/')), [keys])

  if (ordered.length === 0 || !current) return null

  // The downloadable .pptx for the language on screen, when one is published.
  const pptx = (comic.translations ?? []).find(
    (t) => t.language === current.language,
  )?.editablePpt ?? (current.language.toLowerCase().startsWith('eng')
    ? comic.editablePpt
    : undefined)

  return (
    <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHead kicker="The editable deck" title="Read the editable deck" />
        <div className="flex flex-wrap items-center gap-3">
          {ordered.length > 1 && (
            <div
              role="tablist"
              aria-label="Deck language"
              className="inline-flex items-center gap-0.5 rounded-full border border-brand-pale-dusk bg-brand-threshold/70 p-0.5 font-sans"
            >
              {ordered.map((e) => {
                const isActive = e.language === active
                return (
                  <button
                    key={e.language}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActive(e.language)}
                    className={`rounded-full px-4 py-1.5 font-sans text-[0.72rem] font-semibold uppercase tracking-label transition-colors ${
                      isActive
                        ? 'bg-brand-indigo text-brand-pale-dusk shadow-sm'
                        : 'text-brand-slate hover:text-brand-indigo'
                    }`}
                  >
                    {e.language}
                  </button>
                )
              })}
            </div>
          )}
          {pptx && (
            <button
              type="button"
              onClick={() => downloadKey(pptx.key, pptx.filename)}
              className="rounded-full border border-brand-pale-dusk px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate transition-colors hover:text-brand-indigo"
            >
              Download {current.language} (.pptx)
            </button>
          )}
        </div>
      </div>

      <PageFlipViewer
        keys={keys}
        masterKeys={masterKeys}
        title={`${comic.title} — editable deck (${current.language})`}
      />
    </section>
  )
}

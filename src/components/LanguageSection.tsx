'use client'

import type { Comic } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'
import { downloadKey } from '@/lib/downloadDoc'

/**
 * Per-comic LANGUAGE downloads: for each translated edition, the translated
 * script (.md), the editable .pptx and/or the blank-version PDF.
 *
 * Reading a translation happens in the SCRIPT READER above, via the language
 * switcher — this section is downloads only. It used to carry a second, flatter
 * reader with no comment gutter and no provenance markers, which is exactly the
 * gap the switcher closed.
 */
export function LanguageSection({ comic }: { comic: Comic }) {
  const translations = comic.translations
  if (!translations || translations.length === 0) return null

  return (
    <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
      <SectionHead kicker="Translations" title="Download other languages" />

      <div className="flex flex-col gap-8">
        {translations.map((t) => (
          <div key={t.language} className="flex flex-col gap-4 rounded-lg border border-brand-pale-dusk p-5">
            <h3 className="font-serif text-lg text-brand-umber">{t.language}</h3>

            <div className="flex flex-wrap items-center gap-3">
              {t.editablePpt && (
                <button
                  type="button"
                  onClick={() => downloadKey(t.editablePpt!.key, t.editablePpt!.filename)}
                  className="rounded-full bg-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-opacity hover:opacity-90"
                >
                  Download as PPT (editable, {t.language})
                </button>
              )}
              {t.blank && (
                <button
                  type="button"
                  onClick={() => downloadKey(t.blank!.key, t.blank!.filename)}
                  className="rounded-full border border-brand-pale-dusk px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60"
                >
                  Download blank pages (PDF)
                </button>
              )}
              {t.script && (
                <button
                  type="button"
                  aria-label={`Download ${t.language} script`}
                  onClick={() => downloadKey(t.script!.key, `${comic.slug}-script-${t.language.toLowerCase()}.md`)}
                  className="rounded-full border border-brand-pale-dusk px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-slate transition-colors hover:text-brand-indigo"
                >
                  Download script (.md)
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

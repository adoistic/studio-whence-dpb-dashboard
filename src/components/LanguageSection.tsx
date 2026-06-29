'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'
import { DocMarkdown } from '@/components/DocMarkdown'
import { useGatedText } from '@/lib/useGatedText'
import { downloadKey } from '@/lib/downloadDoc'

/** Inline reader for a translated script; mounts only when opened so the /read
 *  request fires once, on demand (same pattern as DocumentsPanel). */
function ScriptReader({ readKey }: { readKey: string }) {
  const { text, loading, error } = useGatedText(readKey)
  if (loading) {
    return (
      <p role="status" className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
        Loading…
      </p>
    )
  }
  if (error || text == null) {
    return <p className="font-serif italic text-brand-slate">Not available yet.</p>
  }
  return <DocMarkdown text={text} />
}

/**
 * Per-comic LANGUAGE section: for each translated edition, a header (e.g. "Hindi"
 * / "English") with the translated script (read inline) plus downloads for the
 * translated editable .pptx and/or the blank-version PDF. Reads `comic.translations`.
 */
export function LanguageSection({ comic }: { comic: Comic }) {
  const translations = comic.translations
  const [openKey, setOpenKey] = useState<string | null>(null)
  if (!translations || translations.length === 0) return null

  return (
    <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
      <SectionHead kicker="Translations" title="Other languages" />

      <div className="flex flex-col gap-8">
        {translations.map((t) => {
          const scriptKey = t.script?.key ?? null
          const isOpen = scriptKey != null && openKey === scriptKey
          return (
            <div key={t.language} className="flex flex-col gap-4 rounded-lg border border-brand-pale-dusk p-5">
              <h3 className="font-serif text-lg text-brand-umber">{t.language}</h3>

              {/* Download actions */}
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

              {/* Inline script reader */}
              {scriptKey && (
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenKey(isOpen ? null : scriptKey)}
                    className="self-start rounded-full border border-brand-pale-dusk px-3 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60"
                  >
                    {isOpen ? 'Close script' : 'Read script'}
                  </button>
                  {isOpen && <ScriptReader readKey={scriptKey} />}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

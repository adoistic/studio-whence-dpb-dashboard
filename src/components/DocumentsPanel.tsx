'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'
import { DocMarkdown } from '@/components/DocMarkdown'
import { useGatedText } from '@/lib/useGatedText'
import { downloadKey } from '@/lib/downloadDoc'

/**
 * Inline reader for a single client doc. Mounts only when an item is opened, so
 * useGatedText(readKey) fires exactly one /read request — the one the reader
 * needs — rather than one per item the panel lists.
 */
function DocReader({ readKey }: { readKey: string }) {
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

export function DocumentsPanel({ comic }: { comic: Comic }) {
  const docs = comic.docs
  // Track which item's inline reader is open (by readKey); null = none open.
  const [openKey, setOpenKey] = useState<string | null>(null)
  if (!docs) return null

  return (
    <section className="flex flex-col gap-6 border-t border-brand-pale-dusk pt-16">
      <SectionHead kicker="Client docs" title="Documents" />

      {/* Primary actions — the whole pack, two ways. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => downloadKey(docs.bundleKey, `${comic.slug}-doc-pack.md`)}
          className="rounded-full bg-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-opacity hover:opacity-90"
        >
          Download doc pack (.md)
        </button>
        <button
          type="button"
          onClick={() => downloadKey(docs.zipKey, `${comic.slug}-docs.zip`)}
          className="rounded-full border border-brand-pale-dusk px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60"
        >
          .zip
        </button>
        <span className="font-sans text-[0.66rem] uppercase tracking-label text-brand-slate">
          as of {docs.generatedAt}
        </span>
      </div>

      {/* Individual files — a disclosure listing each doc with its own read +
          download controls. */}
      <details className="rounded-lg border border-brand-pale-dusk">
        <summary className="cursor-pointer select-none px-4 py-3 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo">
          Individual files
        </summary>
        <ul className="flex flex-col divide-y divide-brand-pale-dusk border-t border-brand-pale-dusk">
          {docs.items.map((item) => {
            const isOpen = openKey === item.readKey
            return (
              <li key={item.readKey} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-serif text-brand-umber">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenKey(isOpen ? null : item.readKey)}
                      className="rounded-full border border-brand-pale-dusk px-3 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60"
                    >
                      {isOpen ? 'Close' : 'Read'}
                    </button>
                    <button
                      type="button"
                      aria-label={`Download file: ${item.label}`}
                      onClick={() => downloadKey(item.downloadKey, `${comic.slug}-${item.type}.md`)}
                      className="rounded-full border border-brand-pale-dusk px-3 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-label text-brand-slate transition-colors hover:text-brand-indigo"
                    >
                      Download
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="pt-1">
                    <DocReader readKey={item.readKey} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </details>
    </section>
  )
}

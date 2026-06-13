'use client'

import { useState } from 'react'
import { useResearchManifest, type ResearchFile } from '@/lib/catalog'
import { useGatedText } from '@/lib/useGatedText'
import { DocMarkdown } from '@/components/DocMarkdown'

/**
 * Inline reader for a single research file. Mounts only when its row is opened,
 * so useGatedText(readKey) fires exactly one /read request — the one the reader
 * needs — rather than one per file the manifest lists. Mirrors DocumentsPanel's
 * DocReader.
 */
function ResearchReader({ readKey }: { readKey: string }) {
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

/** One file row: a Read/Close toggle plus an inline reader when open. */
function FileRow({
  file,
  isOpen,
  onToggle,
}: {
  file: ResearchFile
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-serif text-brand-umber">{file.label}</span>
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={onToggle}
          className="rounded-full border border-brand-pale-dusk px-3 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60"
        >
          {isOpen ? 'Close' : 'Read'}
        </button>
      </div>
      {isOpen && (
        <div className="pt-1">
          <ResearchReader readKey={file.readKey} />
        </div>
      )}
    </li>
  )
}

/**
 * Research library panel for a line (e.g. medicomics). Reads the gated manifest
 * at meta/research_{line}, then renders the per-disease `groups` (and any
 * `topLevel` files) as collapsible disclosures; each file expands into an inline
 * reader served through the same gated /read channel the docs panels use.
 *
 * Self-hides when there is no manifest (so it appears only on lines that have a
 * published research library).
 */
export function ResearchLibrary({ line }: { line: string }) {
  const { data: manifest, loading } = useResearchManifest(line)
  // The single open file row, tracked by its readKey (unique across groups).
  const [openKey, setOpenKey] = useState<string | null>(null)

  if (loading || !manifest) return null

  const groups = manifest.groups ?? []
  const topLevel = manifest.topLevel ?? []
  if (groups.length === 0 && topLevel.length === 0) return null

  const renderFiles = (files: ResearchFile[]) => (
    <ul className="flex flex-col divide-y divide-brand-pale-dusk border-t border-brand-pale-dusk">
      {files.map((file) => (
        <FileRow
          key={file.readKey}
          file={file}
          isOpen={openKey === file.readKey}
          onToggle={() => setOpenKey(openKey === file.readKey ? null : file.readKey)}
        />
      ))}
    </ul>
  )

  return (
    <section className="flex flex-col gap-6 pb-24">
      <span className="flex items-center gap-3">
        <span aria-hidden className="block h-px w-7 bg-brand-gold" />
        <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
          The library
        </span>
      </span>
      <h2 className="font-serif font-light text-brand-indigo text-3xl md:text-4xl">
        Research library
      </h2>

      <div className="flex flex-col gap-3">
        {/* Per-disease groups. */}
        {groups.map((group) => (
          <details
            key={group.disease}
            className="rounded-lg border border-brand-pale-dusk"
          >
            <summary className="cursor-pointer select-none px-4 py-3 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo">
              {group.title}
            </summary>
            {renderFiles(group.files)}
          </details>
        ))}

        {/* Line-wide top-level files (e.g. the master library index). */}
        {topLevel.length > 0 && (
          <details className="rounded-lg border border-brand-pale-dusk">
            <summary className="cursor-pointer select-none px-4 py-3 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo">
              Library overview
            </summary>
            {renderFiles(topLevel)}
          </details>
        )}
      </div>
    </section>
  )
}

'use client'

import { useState } from 'react'
import type { Figure } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'
import { ResearchReader } from '@/components/ResearchReader'

function titleCaseSlug(slug: string): string {
  return slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

export function FigurePageShell({ figure }: { figure: Figure }) {
  const [selected, setSelected] = useState<string | null>(null)
  const sources = figure.sources ?? []

  return (
    <div>
      {/* ── Masthead ───────────────────────────────────────────────── */}
      <section className="surface-deep grain relative overflow-hidden">
        <div className="relative mx-auto max-w-[1100px] px-6 py-14 md:py-16">
          <h1 className="font-serif font-light leading-[1.0] text-brand-cream text-[2.1rem] md:text-[3rem]">
            {titleCaseSlug(figure.slug)}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-10 gap-y-3">
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/70">
              {figure.series}
            </span>
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
              {figure.sources_count} sources · {figure.words.toLocaleString()} words
            </span>
          </div>
        </div>
      </section>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1100px] px-6">
        <div className="grid gap-12 pt-12 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          {/* Sources index */}
          <section className="flex flex-col gap-6">
            <SectionHead kicker="The dossier" title="Sources" />
            {sources.length === 0 ? (
              <p className="font-serif italic text-brand-slate">No sources indexed.</p>
            ) : (
              <ul className="flex flex-col gap-6">
                {sources.map((source) => (
                  <li key={source.slug} className="flex flex-col gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-serif text-brand-indigo leading-snug">{source.title}</span>
                      <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">
                        {source.kind} · {source.words.toLocaleString()} words
                      </span>
                    </div>
                    <ul className="flex flex-col gap-1 border-l border-brand-pale-dusk pl-3">
                      {source.files.map((file) => {
                        const isActive = selected === file.path
                        return (
                          <li key={file.path}>
                            <button
                              type="button"
                              onClick={() => setSelected(file.path)}
                              aria-current={isActive ? 'page' : undefined}
                              className={`text-left font-sans text-[0.72rem] tracking-label transition-colors ${
                                isActive ? 'text-brand-indigo' : 'text-brand-slate hover:text-brand-indigo'
                              }`}
                            >
                              {file.title}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Reader panel */}
          <section className="flex flex-col gap-6 pb-24">
            <SectionHead kicker="Read" title="Research" />
            <ResearchReader fileKey={selected ? `research/${selected}` : null} />
          </section>
        </div>
      </main>
    </div>
  )
}

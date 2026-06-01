import type { ReactNode } from 'react'
import type { Line } from '@/types/content'
import { Eyebrow } from '@/components/Eyebrow'

interface LinePageShellProps {
  line: Line
  introMdx: ReactNode
}

export function LinePageShell({ line, introMdx }: LinePageShellProps) {
  return (
    <main className="max-w-[1200px] mx-auto px-6 py-20 flex flex-col gap-12">
      <Eyebrow>{line.title}</Eyebrow>

      <div className="flex flex-col gap-3">
        <h1 className="font-serif font-light text-brand-indigo text-4xl">
          {line.title}
        </h1>
        <p className="font-serif text-brand-lavender text-lg">{line.subtitle}</p>
      </div>

      <div className="max-w-2xl">{introMdx}</div>

      {line.slug === 'biographies' && line.figures.length > 0 && (
        <p className="font-sans text-xs uppercase tracking-label text-brand-slate">
          {line.figures.length} figures researched.
        </p>
      )}

      {/* TODO Task 3.5: comics-in-production DataTable */}
      <p className="font-serif text-brand-slate">
        {line.comics.length} comics in production.
      </p>

      {/* TODO: handoff download (Chunk 4/5 — needs Storage + auth) */}
    </main>
  )
}

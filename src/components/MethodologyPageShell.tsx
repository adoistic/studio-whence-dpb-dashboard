'use client'

import { useMethodology } from '@/lib/catalog'
import { useGatedText } from '@/lib/useGatedText'
import { downloadKey } from '@/lib/downloadDoc'
import { DocMarkdown } from '@/components/DocMarkdown'

export function MethodologyPageShell() {
  const m = useMethodology()
  const meta = m.data
  const { text, loading } = useGatedText(meta?.readKey ?? null)

  return (
    <div>
      {/* ── Masthead ───────────────────────────────────────────────────── */}
      <section className="surface-deep grain relative overflow-hidden">
        <div className="relative mx-auto max-w-[1100px] px-6 py-16 md:py-20">
          <span className="flex items-center gap-3">
            <span aria-hidden className="block h-px w-7 bg-brand-gold" />
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
              Studio Whence
            </span>
          </span>
          <h1 className="mt-6 font-serif font-light leading-[0.98] text-brand-cream text-[2.4rem] md:text-[3.6rem]">
            Methodology
          </h1>
          <p className="mt-5 max-w-xl font-serif text-lg leading-relaxed text-brand-pale-dusk/80">
            How the comic-production pipeline researches, writes and grounds every book.
          </p>
        </div>
      </section>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1100px] px-6 pb-24 pt-14 md:pt-16">
        {meta && text != null ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => downloadKey(meta.downloadKey, 'diamond-books-methodology.md')}
                className="rounded-full bg-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-opacity hover:opacity-90"
              >
                Download (.md)
              </button>
              <span className="font-sans text-[0.66rem] uppercase tracking-label text-brand-slate">
                as of {meta.generatedAt}
              </span>
            </div>
            <div className="pt-10">
              <DocMarkdown text={text} />
            </div>
          </>
        ) : m.loading || loading ? (
          <p role="status" className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
            Loading…
          </p>
        ) : (
          <p className="font-serif italic text-brand-slate">The methodology is not available yet.</p>
        )}
      </main>
    </div>
  )
}

'use client'

import type { AiConversationAnalysis, AnchorRef } from '@/types/aiConversation'

/**
 * Navigable reader for a conversation's structured analysis: a TL;DR lead, a
 * chapter table-of-contents, a key-outputs callout, and a sources list. Each
 * chapter / key output deep-links into the verbatim transcript via onJump,
 * which scrolls + highlights the anchor's line (when resolved). Sections
 * self-hide when their array is empty.
 */
export function ConversationAnalysis({
  analysis,
  onJump,
}: {
  analysis: AiConversationAnalysis
  onJump: (line: number) => void
}) {
  const { tldr, chapters, keyOutputs, sources } = analysis
  const jump = (anchor: AnchorRef) => () => onJump(anchor.line)

  return (
    <div className="flex flex-col gap-4">
      {tldr && (
        <p className="font-serif text-sm leading-relaxed text-brand-umber">{tldr}</p>
      )}

      {chapters.length > 0 && (
        <section>
          <h4 className="mb-2 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
            Chapters
          </h4>
          <ol className="flex flex-col gap-1.5">
            {chapters.map((ch, i) => {
              const body = (
                <>
                  <span className="font-sans text-[0.7rem] text-brand-slate">{i + 1}.</span>{' '}
                  <span className="font-medium text-brand-umber">{ch.title}</span>
                  {ch.summary && (
                    <span className="block font-sans text-[0.7rem] leading-snug text-brand-slate">
                      {ch.summary}
                    </span>
                  )}
                </>
              )
              return (
                <li key={ch.id}>
                  {ch.anchor.resolved ? (
                    <button
                      type="button"
                      onClick={jump(ch.anchor)}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm text-brand-umber transition-colors hover:bg-brand-indigo/5"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="px-2 py-1.5 text-left text-sm text-brand-umber">{body}</div>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {keyOutputs.length > 0 && (
        <section className="rounded-lg border border-brand-gold/50 bg-brand-gold/5 p-3">
          <h4 className="mb-2 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
            Key outputs
          </h4>
          <ul className="flex flex-col gap-1.5">
            {keyOutputs.map((o, i) => {
              const body = (
                <>
                  <span className="font-medium text-brand-umber">{o.label}</span>
                  {o.detail && (
                    <span className="font-sans text-[0.75rem] text-brand-slate">: {o.detail}</span>
                  )}
                </>
              )
              return (
                <li key={`${o.label}-${i}`}>
                  {o.anchor.resolved ? (
                    <button
                      type="button"
                      onClick={jump(o.anchor)}
                      className="w-full rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-brand-gold/10"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="px-2 py-1 text-left text-sm">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {sources.length > 0 && (
        <section>
          <h4 className="mb-2 font-sans text-[0.6rem] uppercase tracking-label text-brand-slate">
            Sources
          </h4>
          <ul className="flex flex-col gap-1">
            {sources.map((s, i) => (
              <li key={`${s.label}-${i}`} className="flex items-center gap-2 text-sm text-brand-umber">
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {s.kind && (
                  <span className="rounded-sm border border-brand-pale-dusk px-1.5 py-0.5 font-sans text-[0.55rem] uppercase tracking-label text-brand-slate">
                    {s.kind}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

'use client'

/**
 * The line that keeps language decoupling from reading as data loss.
 *
 * Comments are scoped to the language they were written for, so opening the
 * English edition of a Hindi original shows none of its Hindi feedback. That is
 * correct — and it would still look like a bug. `yoga-ka-ek-din` alone carries
 * 50 comments on its Hindi master. This states the filter and offers one click
 * through it: decoupled by default, never invisible.
 */
export function LanguageFilterNote({
  activeLabel, otherCount, showingAll, onToggle,
}: {
  activeLabel: string
  otherCount: number
  showingAll: boolean
  onToggle: () => void
}) {
  if (otherCount === 0) return null
  return (
    <p className="flex flex-wrap items-center gap-2 font-sans text-[0.66rem] uppercase tracking-label text-brand-slate">
      <span>{showingAll ? 'Showing all languages' : `Showing ${activeLabel}`}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={onToggle}
        className="underline decoration-brand-gold underline-offset-2 transition-colors hover:text-brand-indigo"
      >
        {showingAll ? `${activeLabel} only` : `${otherCount} more in other languages`}
      </button>
    </p>
  )
}

'use client'

import type { ComicLanguage } from '@/lib/comicLanguages'

/**
 * The language pill row for the script reader. Renders nothing for a
 * single-language comic — most of the catalogue — so the reader header stays
 * quiet until there is a real choice to make.
 */
export function LanguageSwitcher({
  languages, active, onChange,
}: {
  languages: ComicLanguage[]
  active: string
  onChange: (code: string) => void
}) {
  if (languages.length < 2) return null
  return (
    <div
      role="tablist"
      aria-label="Script language"
      className="inline-flex items-center gap-0.5 rounded-full border border-brand-pale-dusk bg-brand-threshold/70 p-0.5 font-sans"
    >
      {languages.map((lang) => {
        const isActive = lang.code === active
        return (
          <button
            key={lang.code}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(lang.code)}
            className={`rounded-full px-4 py-1.5 font-sans text-[0.72rem] font-semibold uppercase tracking-label transition-colors ${
              isActive
                ? 'bg-brand-indigo text-brand-pale-dusk shadow-sm'
                : 'text-brand-slate hover:text-brand-indigo'
            }`}
          >
            {lang.label}
          </button>
        )
      })}
    </div>
  )
}

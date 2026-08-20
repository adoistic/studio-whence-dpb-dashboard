'use client'

import Link from 'next/link'
import { usePagedSearch } from '@/lib/search'
import { languageLabel } from '@/lib/comicLanguages'

/**
 * Search results: one row per matching PAGE, because a page is what you can be
 * taken to and the one anchor every language shares. A hit in a translation
 * carries its language, and the link opens the reader in that language.
 */
export function SearchResults({ q }: { q: string }) {
  const { data, loading, loadingMore, error, loadMore, hasMore } = usePagedSearch(q)

  if (!q.trim()) {
    return (
      <p className="font-serif italic text-brand-slate">
        Type a keyword to search every comic script.
      </p>
    )
  }
  if (loading) {
    return (
      <p role="status" className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
        Searching…
      </p>
    )
  }
  if (error) {
    return (
      <p className="font-serif italic text-brand-slate">
        Search is unavailable right now. Try again in a moment.
      </p>
    )
  }
  if (!data || data.total === 0) {
    return <p className="font-serif italic text-brand-slate">Nothing matches “{q}”.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="font-sans text-[0.66rem] uppercase tracking-label text-brand-slate">
        {data.total} {data.total === 1 ? 'page' : 'pages'}
      </p>
      <ul className="flex flex-col gap-4">
        {data.hits.map((hit) => (
          <li
            key={`${hit.comicId}-${hit.lang}-${hit.page}`}
            className="rounded-lg border border-brand-pale-dusk p-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Link
                href={`/${hit.line}/${hit.slug}?page=${hit.page}&lang=${hit.lang}`}
                className="font-serif text-lg text-brand-indigo transition-opacity hover:opacity-70"
              >
                {hit.title}
              </Link>
              <span className="font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">
                Page {hit.page}
              </span>
              <span className="rounded-full border border-brand-lavender/30 px-2 py-0.5 font-sans text-[0.6rem] text-brand-slate">
                {languageLabel(hit.lang)}
              </span>
            </div>
            <p className="mt-2 font-serif text-brand-umber">{hit.snippet}</p>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="self-start rounded-full border border-brand-pale-dusk px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-threshold/60 disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : `Load more (${data.total - data.hits.length} left)`}
        </button>
      )}
    </div>
  )
}

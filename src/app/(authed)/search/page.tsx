'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SearchResults } from '@/components/SearchResults'
import { SectionHead } from '@/components/SectionHead'

/**
 * The results page.
 *
 * The query comes from `useSearchParams`, NOT from `window.location.search`.
 * That distinction is the whole bug this file once had: searching a new term
 * while already on /search is a `router.push`, and pushState does not fire
 * `popstate` — so a window-based reader updated the URL and kept rendering the
 * previous results. `useSearchParams` is reactive to router navigation, so the
 * results follow the URL.
 *
 * The Suspense boundary is required because the app is a STATIC EXPORT: params
 * are unknown at prerender and resolve on the client.
 */
function SearchPageBody() {
  const params = useSearchParams()
  const q = params.get('q') ?? ''

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-16">
      <SectionHead kicker="Search" title={q ? `“${q}”` : 'Search the scripts'} />
      <div className="mt-10">
        <SearchResults q={q} />
      </div>
    </main>
  )
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-[1100px] px-6 py-16">
          <SectionHead kicker="Search" title="Search the scripts" />
        </main>
      }
    >
      <SearchPageBody />
    </Suspense>
  )
}

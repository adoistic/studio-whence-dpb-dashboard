'use client'

import { useEffect, useState } from 'react'
import { SearchResults } from '@/components/SearchResults'
import { SectionHead } from '@/components/SectionHead'

/**
 * The results page. The query is read from `window.location.search` rather than
 * `useSearchParams` because this app is a STATIC EXPORT — the same reason
 * /comic reads its segments from the path.
 */
export default function SearchPage() {
  const [q, setQ] = useState('')

  useEffect(() => {
    const read = () => setQ(new URLSearchParams(window.location.search).get('q') ?? '')
    read()
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [])

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-16">
      <SectionHead kicker="Search" title={q ? `“${q}”` : 'Search the scripts'} />
      <div className="mt-10">
        <SearchResults q={q} />
      </div>
    </main>
  )
}

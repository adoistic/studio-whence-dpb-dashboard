'use client'

import { useEffect, useState } from 'react'
import type { Comic } from '@/types/content'
import { comicPageKeys } from '@/lib/comicPageKeys'
import { useResolved } from '@/lib/useResolved'

export function ComicReader({ comic }: { comic: Comic }) {
  const keys = comicPageKeys(comic)
  const urls = useResolved(keys)
  const [i, setI] = useState(0)
  const total = keys.length

  const prev = () => setI((n) => Math.max(0, n - 1))
  const next = () => setI((n) => Math.min(total - 1, n + 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total])

  if (total === 0) return null
  const currentUrl = urls[keys[i]]

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-[760px]">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt={`${comic.title} — frame ${i + 1}`} className="w-full rounded-md shadow-md" />
        ) : (
          <div role="status" className="aspect-[2/3] w-full animate-pulse rounded-md bg-brand-pale-dusk/40" />
        )}
      </div>
      <div className="flex items-center gap-6">
        <button type="button" onClick={prev} disabled={i === 0} aria-label="Previous page"
          className="rounded-full border border-brand-pale-dusk px-4 py-1.5 font-sans text-[0.72rem] uppercase tracking-label disabled:opacity-40">Prev</button>
        <span className="font-sans text-[0.72rem] uppercase tracking-label text-brand-slate">{i + 1} / {total}</span>
        <button type="button" onClick={next} disabled={i === total - 1} aria-label="Next page"
          className="rounded-full border border-brand-pale-dusk px-4 py-1.5 font-sans text-[0.72rem] uppercase tracking-label disabled:opacity-40">Next</button>
      </div>
    </div>
  )
}

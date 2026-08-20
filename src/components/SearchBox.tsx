'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchRules } from '@/components/SearchRules'

/**
 * The portal's way in by keyword rather than by clicking.
 *
 * Desktop: an input in the top bar, focused with `/`.
 * Mobile: a trigger that opens a full-screen sheet — responsive by
 * construction, rather than by squeezing a desktop control into 375px.
 */
export function SearchBox() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // `/` focuses search — unless the reader is already typing somewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const query = q.trim()
    if (!query) return
    setSheetOpen(false)
    router.push(`/search?${new URLSearchParams({ q: query })}`)
  }

  const field = (
    <form role="search" onSubmit={submit} className="flex w-full items-center gap-2">
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the scripts"
        aria-label="Search comic scripts"
        className="min-w-0 flex-1 rounded-full border border-brand-pale-dusk bg-brand-cream px-4 py-2 font-sans text-[0.8rem] text-brand-umber placeholder:text-brand-slate/70 focus:border-brand-gold focus:outline-none"
      />
      <button
        type="button"
        aria-expanded={rulesOpen}
        onClick={() => setRulesOpen((v) => !v)}
        className="whitespace-nowrap font-sans text-[0.62rem] uppercase tracking-label text-brand-slate underline decoration-brand-gold underline-offset-2 transition-colors hover:text-brand-indigo"
      >
        Search rules
      </button>
    </form>
  )

  return (
    <>
      {/* Desktop */}
      <div className="relative hidden md:block md:w-72 lg:w-96">
        {field}
        {rulesOpen && (
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-brand-pale-dusk bg-brand-cream p-3 shadow-lg">
            <SearchRules />
          </div>
        )}
      </div>

      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Search"
        className="rounded-full border border-brand-pale-dusk px-3 py-2 font-sans text-[0.66rem] uppercase tracking-label text-brand-indigo md:hidden"
      >
        Search
      </button>

      {/* Mobile full-screen sheet */}
      {sheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="fixed inset-0 z-50 flex flex-col gap-4 bg-brand-cream p-5 md:hidden"
        >
          <div className="flex items-center justify-between">
            <span className="font-sans text-[0.66rem] uppercase tracking-label text-brand-slate">
              Search
            </span>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="font-sans text-[0.66rem] uppercase tracking-label text-brand-indigo"
            >
              Close
            </button>
          </div>
          {field}
          <div className="rounded-lg border border-brand-pale-dusk bg-brand-threshold p-3">
            <SearchRules />
          </div>
        </div>
      )}
    </>
  )
}

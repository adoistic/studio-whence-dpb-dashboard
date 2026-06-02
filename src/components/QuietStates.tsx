'use client'

import { useEffect, useState } from 'react'

export function LoadingState() {
  return (
    <div role="status" className="flex min-h-[40vh] items-center justify-center">
      <p className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">Loading…</p>
    </div>
  )
}

// The role="alert" region is filled AFTER mount via the effect, because a live
// region that mounts already-populated announces unreliably across some
// screen-reader/browser pairs (present-then-filled is the reliable pattern).
export function ErrorState() {
  const [announce, setAnnounce] = useState('')
  useEffect(() => {
    setAnnounce('Couldn’t load. Please reload the page.')
  }, [])
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
      <p className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">Couldn’t load</p>
      <p className="max-w-xs font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/55">
        Please reload the page.
      </p>
      <div role="alert" className="sr-only">{announce}</div>
    </div>
  )
}

export function NotFoundState({ title, detail }: { title: string; detail: string }) {
  return (
    <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
      <p className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">{title}</p>
      <p className="max-w-xs font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/55">
        {detail}
      </p>
    </div>
  )
}

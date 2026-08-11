'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eyebrow } from '@/components/Eyebrow'
import { SectionHead } from '@/components/SectionHead'
import { useUser, useAllowStatus } from '@/lib/auth'
import { useLines } from '@/lib/catalog'
import {
  SURFACE_BLURB,
  SURFACE_LABEL,
  useActiveSurface,
  useAvailableSurfaces,
  type Surface,
} from '@/lib/surface'

// The post-sign-in fork. Reached only when a person has both surfaces — the
// layout sends anyone with exactly one straight through, so this page is never
// a dead end and never asks a question with one answer.

export default function ChooseSurface() {
  const router = useRouter()
  const { user, loading } = useUser()
  const status = useAllowStatus(user, loading)
  const email = user?.email ?? null
  const { data: lines } = useLines()
  const { data: available, loading: surfacesLoading } = useAvailableSurfaces(status, email, lines ?? null)
  const { setSurface } = useActiveSurface()

  // Nothing to choose between — resolve it and leave.
  useEffect(() => {
    if (surfacesLoading || !available) return
    if (available.length === 1) {
      setSurface(available[0])
      router.replace('/')
    }
    if (available.length === 0) router.replace('/')
  }, [available, surfacesLoading, setSurface, router])

  function pick(surface: Surface) {
    setSurface(surface)
    router.replace('/')
  }

  if (surfacesLoading || !available || available.length < 2) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div role="status">
          <Eyebrow>Loading</Eyebrow>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-[1200px] px-6 py-20 md:py-28">
      <SectionHead kicker="Studio Whence" title="Where would you like to start?" />
      <p className="mt-4 max-w-xl font-serif leading-relaxed text-brand-umber">
        You have access to both. Pick one to begin; you can switch at any time from the menu.
      </p>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {available.map((surface) => (
          <button
            key={surface}
            type="button"
            onClick={() => pick(surface)}
            className="group flex flex-col items-start gap-3 rounded-xl border border-brand-pale-dusk bg-white/60 p-8 text-left transition-colors duration-200 hover:border-brand-indigo/40 hover:bg-white"
          >
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
              {surface === 'manga' ? 'New' : 'In production'}
            </span>
            <span className="font-serif text-3xl font-light text-brand-indigo">
              {SURFACE_LABEL[surface]}
            </span>
            <span className="font-serif leading-relaxed text-brand-umber">
              {SURFACE_BLURB[surface]}
            </span>
          </button>
        ))}
      </div>
    </main>
  )
}

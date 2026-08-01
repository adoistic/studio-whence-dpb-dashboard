'use client'

import { useState } from 'react'
import { useAllPrograms, useLines } from '@/lib/catalog'
import { useVisibleComics, useVisibleFigures } from '@/lib/visibleCatalog'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { downloadStatusWorkbook } from '@/lib/statusWorkbook'

// The home page's "Download Excel" button: the whole production status —
// lines, programs, subjects, comics and every component — built in the browser
// from live catalog reads at the moment it is clicked, so it is never a stale
// pre-baked file.
//
// It reads through the gated useVisible* hooks, so what lands in the workbook is
// exactly what this viewer can see on the portal: an editor exports their own
// allocation, an admin exports the library.
export function StatusWorkbookButton() {
  const { user, loading: authLoading } = useUser()
  const status = useAllowStatus(user, authLoading)
  const canMod = canModerate(status)
  const email = user?.email ?? null

  const { data: comics } = useVisibleComics(canMod, email)
  const { data: figures } = useVisibleFigures(canMod, email)
  const { data: lines } = useLines()
  const { data: programs } = useAllPrograms()

  const [state, setState] = useState<'idle' | 'building' | 'error'>('idle')
  const ready = !!comics && !!figures && !!lines && !!programs

  async function handleClick() {
    if (!ready || state === 'building') return
    setState('building')
    try {
      await downloadStatusWorkbook({
        comics: comics!,
        figures: figures!,
        programs: programs!,
        lines: lines!,
      })
      setState('idle')
    } catch (err) {
      console.error('status workbook failed', err)
      setState('error')
    }
  }

  const label =
    state === 'building' ? 'Building…'
      : state === 'error' ? 'Failed — try again'
        : ready ? '↓ Download Excel'
          : 'Loading…'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!ready || state === 'building'}
      title="The full production status — every line, program, subject and comic, with links"
      className="font-sans text-xs uppercase tracking-label text-brand-slate transition-colors hover:text-brand-indigo disabled:cursor-default disabled:opacity-50"
    >
      {label}
    </button>
  )
}

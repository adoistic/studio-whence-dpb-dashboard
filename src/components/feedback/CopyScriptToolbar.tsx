'use client'

import { useState } from 'react'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { useComicFeedback } from '@/lib/feedback'
import { serializeScript, serializeScriptWithComments } from '@/components/feedback/copyScript'
import { ClipboardIcon } from '@/components/feedback/icons'

export interface CopyScriptToolbarProps {
  comicId: string
  comicTitle: string
  draftText: string | null
}

type Which = 'plain' | 'comments'

export function CopyScriptToolbar({ comicId, comicTitle, draftText }: CopyScriptToolbarProps) {
  // Moderators can copy the full (draft + hidden) thread set; members get only
  // the published, non-hidden comments their gated query is allowed to read.
  const { user, loading: authLoading } = useUser()
  const canMod = canModerate(useAllowStatus(user, authLoading))
  const { data: threads } = useComicFeedback(comicId, canMod)
  const [copied, setCopied] = useState<Which | null>(null)

  const disabled = draftText === null

  async function copy(which: Which) {
    if (draftText === null) return
    const text =
      which === 'plain'
        ? serializeScript(draftText)
        : serializeScriptWithComments(draftText, threads, { title: comicTitle })
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500)
    } catch {
      // Clipboard unavailable (e.g. insecure context) — fail quietly.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => copy('plain')}
        aria-label="Copy the script as plain text"
        className="inline-flex items-center gap-1.5 rounded-full border border-brand-pale-dusk px-3 py-1.5 font-sans text-[0.7rem] uppercase tracking-label text-brand-slate transition-colors hover:border-brand-indigo hover:text-brand-indigo disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ClipboardIcon />
        {copied === 'plain' ? 'Copied ✓' : 'Copy script'}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => copy('comments')}
        aria-label="Copy the script with editorial comments"
        className="inline-flex items-center gap-1.5 rounded-full border border-brand-pale-dusk px-3 py-1.5 font-sans text-[0.7rem] uppercase tracking-label text-brand-slate transition-colors hover:border-brand-indigo hover:text-brand-indigo disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ClipboardIcon />
        {copied === 'comments' ? 'Copied ✓' : 'Copy script + comments'}
      </button>
    </div>
  )
}

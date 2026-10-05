'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { resolveUrls } from '@/lib/dataApi'

const LABEL: Record<'pdf' | 'docx', string> = { pdf: 'PDF', docx: 'Word' }

function size(bytes?: number): string {
  if (!bytes) return ''
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`
}

/**
 * The typeset book, as a PDF and a Word file. Same resolve → fetch → blob → anchor flow as the comic
 * PPT button: the key is gated under artifacts/comics/{line}/{slug}/, presigned for a moment, and
 * saved under the book's title. Renders nothing when the book has no typeset files yet.
 */
export function BookDownloads({ comic }: { comic: Comic }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const items = (['pdf', 'docx'] as const).filter((k) => comic.downloads?.[k]?.key)
  if (!items.length) return null

  async function get(kind: 'pdf' | 'docx') {
    const d = comic.downloads?.[kind]
    if (!d?.key) return
    setBusy(kind)
    setError(null)
    try {
      const url = (await resolveUrls([d.key]))[d.key]
      if (!url) throw new Error('no presigned url')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const href = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = href
      a.download = d.filename || `${comic.slug}.${kind}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      console.error('[BookDownloads]', err)
      setError('That download did not work. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-sans text-[0.68rem] uppercase tracking-label text-brand-slate">Download</span>
      {items.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => get(k)}
          disabled={busy !== null}
          className="rounded-full border border-brand-indigo/60 px-3.5 py-1 font-sans text-[0.72rem] text-brand-indigo transition-colors hover:bg-brand-indigo hover:text-white disabled:opacity-50"
        >
          {busy === k ? 'Preparing…' : LABEL[k]}
          {comic.downloads?.[k]?.bytes ? <span className="ml-1.5 opacity-60">{size(comic.downloads[k]!.bytes)}</span> : null}
        </button>
      ))}
      {error && <span role="alert" className="font-sans text-[0.72rem] text-red-700">{error}</span>}
    </div>
  )
}

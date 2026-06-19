'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { useResolved } from '@/lib/useResolved'
import { resolveUrls } from '@/lib/dataApi'
import { makeZip } from '@/lib/zip'

/**
 * "A+ Modules" tab body — shows a comic's Amazon A+ marketing modules stacked
 * the way they appear on an Amazon listing (each module is a full-width image,
 * max ~970px). Image keys come from the gated `amazonModules` catalog block and
 * are resolved to short-lived presigned R2 URLs through the same `/resolve`
 * channel the reader and download buttons use (so access is gated to the comic).
 *
 * Renders a graceful empty state if the keys have not yet resolved; renders
 * nothing at all when the comic carries no modules (the parent hides the tab).
 */
export function AmazonModulesPanel({ comic }: { comic: Comic }) {
  const images = comic.amazonModules?.images ?? []
  const urls = useResolved(images.map((m) => m.key))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (images.length === 0) return null

  async function onDownloadZip() {
    setBusy(true); setError(null)
    try {
      // Resolve every key fresh (the cached presigned URLs may be near expiry),
      // fetch each module's bytes, and zip them client-side.
      const map = await resolveUrls(images.map((m) => m.key))
      const entries = await Promise.all(
        images.map(async (m) => {
          const url = map[m.key]
          if (!url) throw new Error(`no presigned url for ${m.filename}`)
          const res = await fetch(url)
          if (!res.ok) throw new Error(`fetch ${res.status}`)
          const buf = new Uint8Array(await res.arrayBuffer())
          return { name: m.filename, data: buf }
        }),
      )
      const blob = makeZip(entries)
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `${comic.slug}-amazon-modules.zip`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      console.error('[AmazonModulesPanel] zip', err)
      setError('Could not build the ZIP. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-10">
      <div className="flex w-full max-w-[970px] flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="font-serif text-brand-umber leading-relaxed">
          These are the Amazon A+ content modules for this title — the image panels that
          appear on the book&rsquo;s listing page, in order.
        </p>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={onDownloadZip}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {busy ? 'Preparing…' : 'Download all (ZIP)'}
          </button>
          {error && <span role="alert" className="font-sans text-[0.7rem] text-red-700">{error}</span>}
        </div>
      </div>
      {images.map((m) => (
        <figure key={m.key} className="flex w-full max-w-[970px] flex-col gap-2">
          <div className="overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-cream shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)]">
            {urls[m.key] ? (
              <img
                src={urls[m.key]}
                alt={`Amazon module — ${m.label}`}
                loading="lazy"
                className="block w-full"
              />
            ) : (
              <div className="aspect-[970/600] w-full animate-pulse bg-brand-threshold/60" />
            )}
          </div>
          <figcaption className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
            {m.label}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

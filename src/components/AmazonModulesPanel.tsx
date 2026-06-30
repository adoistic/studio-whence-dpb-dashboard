'use client'

import { useState } from 'react'
import type { Comic } from '@/types/content'
import { useResolved } from '@/lib/useResolved'
import { resolveUrls } from '@/lib/dataApi'
import { makeZip } from '@/lib/zip'

type ModuleImage = { key: string; label: string; bytes: number; filename: string }
type ModuleGroup = { title: string; images: ModuleImage[] }

/**
 * "A+ Modules" tab body — shows a comic's Amazon A+ marketing images stacked the
 * way they appear on an Amazon listing (each image is full-width, max ~970px).
 *
 * Supports two shapes from the gated `amazonModules` catalog block:
 *  - `groups[]` — labelled sections (e.g. "Amazon A+ content" + "Supporting
 *    images"), each a stack of images (preferred).
 *  - `images[]` — a single flat stack (legacy; wrapped into one untitled group).
 *
 * Image keys resolve to short-lived presigned R2 URLs through the same `/resolve`
 * channel the reader and download buttons use, so access stays gated to the comic.
 */
export function AmazonModulesPanel({ comic }: { comic: Comic }) {
  const am = comic.amazonModules
  const groups: ModuleGroup[] = am?.groups?.length
    ? am.groups
    : am?.images?.length
      ? [{ title: '', images: am.images }]
      : []
  const allImages = groups.flatMap((g) => g.images)
  const urls = useResolved(allImages.map((m) => m.key))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (allImages.length === 0) return null

  async function onDownloadZip() {
    setBusy(true); setError(null)
    try {
      // Resolve every key fresh (the cached presigned URLs may be near expiry),
      // fetch each image's bytes, and zip them client-side.
      const map = await resolveUrls(allImages.map((m) => m.key))
      const entries = await Promise.all(
        allImages.map(async (m) => {
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
    <div className="flex flex-col items-center gap-12">
      <div className="flex w-full max-w-[970px] flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="font-serif text-brand-umber leading-relaxed">
          These are the Amazon marketing images for this title — the A+ content panels and
          supporting product images that appear on the book&rsquo;s listing page.
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

      {groups.map((group, gi) => (
        <section key={group.title || gi} className="flex w-full max-w-[970px] flex-col items-center gap-8">
          {group.title && (
            <h3 className="self-start font-sans text-[0.78rem] font-semibold uppercase tracking-label text-brand-indigo">
              {group.title}
            </h3>
          )}
          {group.images.map((m) => (
            <figure key={m.key} className="flex w-full flex-col gap-2">
              <div className="overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-cream shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)]">
                {urls[m.key] ? (
                  <img
                    src={urls[m.key]}
                    alt={`Amazon image — ${m.label}`}
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
        </section>
      ))}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Comic } from '@/types/content'
import { comicPageKeys, webVariantKey } from '@/lib/comicPageKeys'
import { readerPageNumber } from '@/lib/readerPages'
import { refreshResolved, useResolved } from '@/lib/useResolved'

export interface ComicReaderProps {
  comic: Comic
  /** page number → comment-thread count, for the per-page badge. */
  pageCounts?: Map<number, number>
  /** Open the page-comments drawer for a page. Omit to hide the affordance. */
  onCommentPage?: (page: number) => void
}

export function ComicReader({ comic, pageCounts, onCommentPage }: ComicReaderProps) {
  // The reader displays the 1200px web variants — the 2000px masters stay on
  // the PDF/print paths. An index whose web variant errors on a fresh presign
  // (not yet published) falls back to its master.
  const masterKeys = comicPageKeys(comic)
  const [masterFallback, setMasterFallback] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  )
  const keys = masterKeys.map((k, idx) =>
    masterFallback.has(idx) ? k : webVariantKey(k),
  )
  const urls = useResolved(keys)
  const total = keys.length
  const [i, setI] = useState(0)
  const [fs, setFs] = useState(false)

  // Warm the pages around the current one so paging is instant. The browser
  // dedupes repeat loads; the ref set just avoids re-kicking known URLs.
  const prefetched = useRef<Set<string>>(new Set())
  const currentUrl = urls[keys[i]]
  useEffect(() => {
    for (const j of [i + 1, i + 2, i + 3, i - 1]) {
      if (j < 0 || j >= keys.length) continue
      const url = urls[keys[j]]
      if (!url || prefetched.current.has(url)) continue
      prefetched.current.add(url)
      new Image().src = url
    }
  })

  // First error on a key → assume an expired presign and re-resolve it; a
  // second error on the fresh URL means the object is missing → master.
  const erroredOnce = useRef<Set<string>>(new Set())
  const onImgError = useCallback(() => {
    const key = keys[i]
    if (!key) return
    if (!erroredOnce.current.has(key)) {
      erroredOnce.current.add(key)
      refreshResolved(key)
    } else if (key !== masterKeys[i]) {
      setMasterFallback((prev) => new Set(prev).add(i))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, keys.join('|')])
  // Which script page the current frame shows (null on the cover frame).
  const page = readerPageNumber(!!comic.pages?.coverKey, i)
  const pageCommentCount = page != null ? (pageCounts?.get(page) ?? 0) : 0

  // Portal target only exists after mount (SSR-safe).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), [])
  const next = useCallback(
    () => setI((n) => Math.min(total - 1, n + 1)),
    [total],
  )

  // Keyboard: arrows page (always); Esc closes fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'Escape' && fs) setFs(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, fs])

  // Lock body scroll while the fullscreen overlay is open.
  useEffect(() => {
    if (!fs) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [fs])

  // Touch swipe (mobile + iPad): horizontal drag past a threshold pages.
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next()
      else prev()
    }
  }

  // Trackpad horizontal swipe (laptop): debounced so one gesture = one page.
  const wheelLock = useRef(0)
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    if (Math.abs(e.deltaX) < 30) return
    if (e.timeStamp - wheelLock.current < 400) return
    wheelLock.current = e.timeStamp
    if (e.deltaX > 0) next()
    else prev()
  }

  if (total === 0) return null
  const atStart = i === 0
  const atEnd = i === total - 1

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Inline page — click to open fullscreen */}
      <button
        type="button"
        onClick={() => setFs(true)}
        aria-label="Open full screen viewer"
        className="group relative block w-full max-w-[760px] cursor-zoom-in"
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt={`${comic.title} — frame ${i + 1}`}
            onError={onImgError}
            className="w-full rounded-md shadow-md"
          />
        ) : (
          <div
            role="status"
            className="aspect-[2/3] w-full animate-pulse rounded-md bg-brand-pale-dusk/40"
          />
        )}
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-brand-indigo/85 px-3 py-1 font-sans text-[0.62rem] uppercase tracking-label text-brand-pale-dusk opacity-0 transition-opacity group-hover:opacity-100">
          Full screen
        </span>
      </button>

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={prev}
          disabled={atStart}
          aria-label="Previous page"
          className="rounded-full border border-brand-pale-dusk px-4 py-1.5 font-sans text-[0.72rem] uppercase tracking-label disabled:opacity-40"
        >
          Prev
        </button>
        <span className="font-sans text-[0.72rem] uppercase tracking-label text-brand-slate">
          {i + 1} / {total}
        </span>
        <button
          type="button"
          onClick={next}
          disabled={atEnd}
          aria-label="Next page"
          className="rounded-full border border-brand-pale-dusk px-4 py-1.5 font-sans text-[0.72rem] uppercase tracking-label disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setFs(true)}
          className="rounded-full bg-brand-indigo px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-pale-dusk transition-opacity hover:opacity-90"
        >
          Full screen
        </button>
        {onCommentPage && page != null && (
          <button
            type="button"
            onClick={() => onCommentPage(page)}
            aria-label={`Comments on page ${page}`}
            className="inline-flex items-center gap-2 rounded-full border border-brand-indigo/40 bg-white px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-indigo hover:text-brand-pale-dusk"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
              <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H6.4L3.2 13.9A.7.7 0 0 1 2 13.35V3.5Z" />
            </svg>
            {pageCommentCount > 0 ? (
              <>
                {pageCommentCount} comment{pageCommentCount === 1 ? '' : 's'} · page {page}
              </>
            ) : (
              <>Comment on page {page}</>
            )}
          </button>
        )}
      </div>

      {/* Fullscreen overlay (portal → body so no ancestor clips it) */}
      {fs &&
        mounted &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${comic.title} — full screen`}
            className="fixed inset-0 z-50 flex flex-col bg-black/95"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
          >
            <div className="flex items-center justify-between px-5 py-3 text-white/80">
              <span className="font-sans text-[0.72rem] uppercase tracking-label">
                {i + 1} / {total}
              </span>
              <div className="flex items-center gap-2">
                {onCommentPage && page != null && (
                  <button
                    type="button"
                    onClick={() => {
                      setFs(false)
                      onCommentPage(page)
                    }}
                    aria-label={`Comments on page ${page}`}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-sans text-[0.72rem] uppercase tracking-label text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                  >
                    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
                      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H6.4L3.2 13.9A.7.7 0 0 1 2 13.35V3.5Z" />
                    </svg>
                    {pageCommentCount > 0 ? `${pageCommentCount} · comment` : 'Comment'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFs(false)}
                  aria-label="Close full screen"
                  className="rounded-full px-3 py-1 font-sans text-[0.85rem] text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-4">
              {/* Prev hit-zone */}
              <button
                type="button"
                onClick={prev}
                disabled={atStart}
                aria-label="Previous page"
                className="absolute left-0 top-0 z-10 flex h-full w-1/4 items-center justify-start pl-3 text-3xl text-white/0 transition-colors hover:text-white/70 disabled:cursor-default disabled:hover:text-white/0"
              >
                ‹
              </button>

              {currentUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUrl}
                  alt={`${comic.title} — frame ${i + 1}`}
                  draggable={false}
                  onError={onImgError}
                  className="max-h-full max-w-full select-none object-contain"
                />
              ) : (
                <div role="status" className="h-2/3 w-1/2 animate-pulse rounded-md bg-white/10" />
              )}

              {/* Next hit-zone */}
              <button
                type="button"
                onClick={next}
                disabled={atEnd}
                aria-label="Next page"
                className="absolute right-0 top-0 z-10 flex h-full w-1/4 items-center justify-end pr-3 text-3xl text-white/0 transition-colors hover:text-white/70 disabled:cursor-default disabled:hover:text-white/0"
              >
                ›
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

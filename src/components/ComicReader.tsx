'use client'

import type { Comic } from '@/types/content'
import { comicPageKeys, webVariantKey } from '@/lib/comicPageKeys'
import { readerPageNumber } from '@/lib/readerPages'
import { PageFlipViewer } from '@/components/PageFlipViewer'

export interface ComicReaderProps {
  comic: Comic
  /** page number → comment-thread count, for the per-page badge. */
  pageCounts?: Map<number, number>
  /** Open the page-comments drawer for a page. Omit to hide the affordance. */
  onCommentPage?: (page: number) => void
}

/**
 * Read the comic. The paging, fullscreen, swipe and prefetch all live in
 * PageFlipViewer, which the EDITABLE DECK reader now shares — the two used to
 * be different objects on the same page and are meant to feel identical.
 *
 * What stays here is what is particular to the comic: it reads the 1200px web
 * variants rather than the 2000px masters, which are reserved for the PDF and
 * print paths, and it carries the per-page comment affordance.
 */
export function ComicReader({ comic, pageCounts, onCommentPage }: ComicReaderProps) {
  const masterKeys = comicPageKeys(comic)
  const keys = masterKeys.map(webVariantKey)

  const commentButton = (i: number, dark = false, close?: () => void) => {
    const page = readerPageNumber(!!comic.pages?.coverKey, i)
    if (!onCommentPage || page == null) return null
    const count = pageCounts?.get(page) ?? 0
    const icon = (
      <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
        <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H6.4L3.2 13.9A.7.7 0 0 1 2 13.35V3.5Z" />
      </svg>
    )
    return (
      <button
        type="button"
        onClick={() => {
          close?.()
          onCommentPage(page)
        }}
        aria-label={`Comments on page ${page}`}
        className={
          dark
            ? 'inline-flex items-center gap-2 rounded-full px-3 py-1 font-sans text-[0.72rem] uppercase tracking-label text-white/80 transition-colors hover:bg-white/15 hover:text-white'
            : 'inline-flex items-center gap-2 rounded-full border border-brand-indigo/40 bg-white px-5 py-2 font-sans text-[0.72rem] font-semibold uppercase tracking-label text-brand-indigo transition-colors hover:bg-brand-indigo hover:text-brand-pale-dusk'
        }
      >
        {icon}
        {dark ? (
          count > 0 ? `${count} · comment` : 'Comment'
        ) : count > 0 ? (
          <>
            {count} comment{count === 1 ? '' : 's'} · page {page}
          </>
        ) : (
          <>Comment on page {page}</>
        )}
      </button>
    )
  }

  return (
    <PageFlipViewer
      keys={keys}
      masterKeys={masterKeys}
      title={comic.title}
      controls={(i) => commentButton(i)}
      fullscreenControls={(i, close) => commentButton(i, true, close)}
    />
  )
}

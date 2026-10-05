import type { Comic } from '@/types/content'
import { coverTone, formatWords, SHELF_LABEL } from '@/lib/books'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  'in-review': 'In review',
  approved: 'Approved',
  published: 'Published',
}

/**
 * A book on a shelf. Books have no cover art yet, so the cover is typographic:
 * a cloth-coloured board carrying the title, which reads as a book at any size
 * and never pretends to be finished artwork.
 */
export function BookCard({ book }: { book: Comic }) {
  const tone = coverTone(book.slug)
  return (
    <a
      href={`/${book.line}/${book.slug}`}
      className="group flex gap-5 rounded-xl border border-brand-pale-dusk bg-white/70 p-4 transition-colors duration-200 hover:border-brand-indigo/40 hover:bg-white"
    >
      <span
        aria-hidden
        className="relative flex h-40 w-28 shrink-0 flex-col justify-between overflow-hidden rounded-[3px] p-3 text-brand-cream shadow-[2px_3px_0_rgba(30,26,58,0.18)]"
        style={{ background: tone }}
      >
        <span className="absolute inset-y-0 left-0 w-2 bg-black/15" />
        <span className="pl-2 font-serif text-[0.95rem] leading-tight">{book.title}</span>
        <span className="pl-2 font-sans text-[0.55rem] uppercase tracking-label text-brand-cream/70">
          Studio Whence
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-2">
        <span className="flex flex-wrap items-center gap-2 font-sans text-[0.62rem] uppercase tracking-label text-brand-slate">
          {book.shelf && <span>{SHELF_LABEL[book.shelf] ?? book.shelf}</span>}
          {book.status && (
            <span className="rounded-full border border-brand-gold/50 px-2 py-0.5 text-brand-umber">
              {STATUS_LABEL[book.status] ?? book.status}
            </span>
          )}
        </span>
        <span className="font-serif text-xl leading-snug text-brand-indigo group-hover:underline">
          {book.title}
        </span>
        {book.subtitle && <span className="font-serif text-brand-umber">{book.subtitle}</span>}
        {book.logline && (
          <span className="line-clamp-3 font-serif text-sm leading-relaxed text-brand-slate">{book.logline}</span>
        )}
        <span className="mt-auto font-sans text-[0.7rem] text-brand-slate">
          {formatWords(book.wordCount)}
          {book.chapterCount ? ` · ${book.chapterCount} chapters` : ''}
        </span>
      </span>
    </a>
  )
}

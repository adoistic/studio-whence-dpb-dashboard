'use client'

import { KpiStrip, type Kpi } from '@/components/KpiStrip'
import { SectionHead } from '@/components/SectionHead'
import { BookCard } from '@/components/books/BookCard'
import { useLines } from '@/lib/catalog'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { useVisibleComics } from '@/lib/visibleCatalog'
import { isBook } from '@/lib/books'
import type { Comic } from '@/types/content'

/**
 * The home page of the Books surface.
 *
 * It does not read meta/coverage. That roll-up is built by the whole-corpus
 * comics publish and knows nothing of books, and filtering it to an empty
 * surface falls back to the unfiltered comics totals by design
 * (filterCoverageBySurface). So the counts here are computed from the books the
 * viewer can actually see, which is also the honest number for a member.
 */
export function BooksHome() {
  const { data: lines } = useLines() // already scoped to the active surface
  const { user, loading } = useUser()
  const status = useAllowStatus(user, loading)
  const { data: visible, loading: booksLoading } = useVisibleComics(canModerate(status), user?.email ?? null)
  const books = (visible ?? []).filter(isBook)

  const byLine = new Map<string, Comic[]>()
  for (const b of books) byLine.set(b.line, [...(byLine.get(b.line) ?? []), b])
  const shelves = (lines ?? [])
    .filter((l) => byLine.has(l.slug))
    .map((l) => ({ line: l, books: (byLine.get(l.slug) ?? []).sort((a, b) => a.title.localeCompare(b.title)) }))

  const words = books.reduce((n, b) => n + (b.wordCount ?? 0), 0)
  const chapters = books.reduce((n, b) => n + (b.chapterCount ?? 0), 0)
  const kpis: Kpi[] = [
    { label: 'books', value: books.length },
    { label: 'chapters', value: chapters },
    { label: 'words written', value: words },
    { label: 'lines', value: shelves.length },
  ]

  return (
    <div>
      <section className="surface-books relative overflow-hidden">
        <div className="relative mx-auto max-w-[1200px] px-6 pb-16 pt-16 md:pb-20 md:pt-24">
          <span className="reveal flex items-center gap-3" style={{ ['--i' as string]: 0 }}>
            <span aria-hidden className="block h-px w-7 bg-brand-umber" />
            <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-umber">
              Books · Diamond Pocket Books
            </span>
          </span>
          <h1
            className="reveal mt-7 max-w-3xl font-serif font-light leading-[0.98] text-brand-deep text-[2.6rem] md:text-[4.2rem]"
            style={{ ['--i' as string]: 1 }}
          >
            Told <em className="font-medium italic">in full.</em>
          </h1>
          <p
            className="reveal mt-6 max-w-xl font-serif text-lg leading-relaxed text-brand-umber"
            style={{ ['--i' as string]: 2 }}
          >
            The research behind the comics, written as books. Every claim carries its source; select any
            passage to comment on it or suggest new wording.
          </p>
          {!booksLoading && (
            <div className="mt-14 border-t border-brand-umber/20 pt-10">
              <KpiStrip kpis={kpis} tone="light" />
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-[1200px] px-6 pb-28">
        {shelves.map(({ line, books: shelf }) => (
          <section key={line.slug} className="flex flex-col gap-8 pt-16 md:pt-20">
            <div className="flex flex-col gap-2">
              <SectionHead kicker="Shelf" title={line.title} />
              {line.subtitle && <p className="max-w-xl font-serif text-brand-umber">{line.subtitle}</p>}
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {shelf.map((b) => <BookCard key={`${b.line}__${b.slug}`} book={b} />)}
            </div>
            <a href={`/${line.slug}`} className="font-sans text-[0.72rem] uppercase tracking-label text-brand-indigo hover:underline">
              The whole {line.title} shelf
            </a>
          </section>
        ))}
        {!booksLoading && shelves.length === 0 && (
          <p className="pt-16 font-serif italic text-brand-slate">
            No books are on your shelves yet. When a book is shared with you it appears here.
          </p>
        )}
      </main>
    </div>
  )
}

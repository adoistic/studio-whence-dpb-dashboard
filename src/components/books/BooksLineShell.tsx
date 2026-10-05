'use client'

import Link from 'next/link'
import type { Comic, Line } from '@/types/content'
import { SectionHead } from '@/components/SectionHead'
import { BookCard } from '@/components/books/BookCard'
import { formatWords, isBook } from '@/lib/books'

/**
 * A books line (books-<category>): its shelves, one per program, with any book
 * outside a program on a shelf of its own. The comics line page carries research
 * tables, people and pipelines; a shelf of books needs none of that, and the
 * research behind each book is one click away inside the book itself.
 */
export function BooksLineShell({ line }: { line: Line }) {
  const books = line.comics.filter(isBook)
  const programs = [...(line.programs ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const inProgram = new Set<string>()
  const shelves: { key: string; title: string; blurb?: string; books: Comic[] }[] = []
  for (const p of programs) {
    const shelf = books.filter((b) => b.program_slug === p.slug)
    shelf.forEach((b) => inProgram.add(b.slug))
    if (shelf.length) shelves.push({ key: p.slug, title: p.title, blurb: p.blurb, books: shelf })
  }
  const loose = books.filter((b) => !inProgram.has(b.slug))
  if (loose.length) shelves.push({ key: '_other', title: programs.length ? 'Other books' : 'Books', books: loose })
  const words = books.reduce((n, b) => n + (b.wordCount ?? 0), 0)

  return (
    <div>
      <section className="surface-books relative overflow-hidden">
        <div className="relative mx-auto max-w-[1200px] px-6 py-16 md:py-20">
          <span className="flex items-center gap-3">
            <span aria-hidden className="block h-px w-7 bg-brand-umber" />
            <Link href="/" className="font-sans text-[0.7rem] uppercase tracking-label text-brand-umber hover:underline">
              Books
            </Link>
          </span>
          <h1 className="mt-6 font-serif font-light leading-[0.98] text-brand-deep text-[2.4rem] md:text-[3.6rem]">
            {line.title}
          </h1>
          {line.subtitle && (
            <p className="mt-5 max-w-xl font-serif text-lg leading-relaxed text-brand-umber">{line.subtitle}</p>
          )}
          <p className="mt-8 font-sans text-[0.72rem] uppercase tracking-label text-brand-slate">
            {books.length} {books.length === 1 ? 'book' : 'books'} · {formatWords(words)}
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-[1200px] px-6 pb-28">
        {shelves.map((s) => (
          <section key={s.key} className="flex flex-col gap-6 pt-14">
            <SectionHead kicker="Shelf" title={s.title} />
            {s.blurb && <p className="-mt-2 max-w-xl font-serif text-brand-umber">{s.blurb}</p>}
            <div className="grid gap-5 md:grid-cols-2">
              {s.books.map((b) => <BookCard key={b.slug} book={b} />)}
            </div>
          </section>
        ))}
        {shelves.length === 0 && (
          <p className="pt-14 font-serif italic text-brand-slate">No books on this shelf are shared with you yet.</p>
        )}
      </main>
    </div>
  )
}

'use client'

/**
 * /kit — the brand kit: the logos, products and places a comic must draw right.
 *
 * The sibling of `/characters`. A biography of a company that gets that
 * company's mark wrong is not a small error, and a model asked for "the Apple
 * logo" reliably draws something apple-shaped and wrong. So every mark is
 * locked here the way a character is: a real reference settles what it looks
 * like, our own flat-cartoon sheet is what a page attaches, and the page picks
 * the sheet by the YEAR it is set in.
 *
 * SURFACE: the kit is filed under the biographies cast domains and is comics-only
 * today, so — unlike the character roster — there is no manga split to hold. The
 * doc still carries `surface`, so the day a manga line needs its own kit the
 * scoping can be added here without reshaping what is published.
 */

import { useKitDocs } from '@/lib/kit'
import KitRoster from '@/components/KitRoster'
import { SectionHead } from '@/components/SectionHead'
import { ErrorState, LoadingState } from '@/components/QuietStates'

export default function KitPage() {
  const { docs, loading, error } = useKitDocs()

  return (
    <div>
      <section className="surface-deep grain relative overflow-hidden">
        <div className="relative mx-auto max-w-[1200px] px-6 py-14 md:py-16">
          <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
            The brand kit
          </span>
          <h1 className="mt-4 font-serif font-light leading-[1.0] text-brand-cream text-[2.1rem] md:text-[3rem]">
            Every mark, by era
          </h1>
          <p className="mt-5 max-w-2xl font-serif text-lg leading-relaxed text-brand-pale-dusk/80">
            The logos, products and places our books have to get right. A mark
            belongs to a year, not to a company — Apple&rsquo;s carried a wordmark
            until 1984 and stood alone after it — so each one is locked era by
            era, and a page takes the form that was current when the scene is set.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-[1200px] px-6 pb-24 pt-14">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState />
        ) : docs.length === 0 ? (
          <div className="flex flex-col gap-4">
            <SectionHead kicker="Brand kit" title="No kit published yet" />
            <p className="max-w-xl font-serif text-brand-umber">
              The brand kit is built by the production pipeline. Nothing has been
              published yet.
            </p>
          </div>
        ) : (
          <KitRoster docs={docs} />
        )}
      </main>
    </div>
  )
}

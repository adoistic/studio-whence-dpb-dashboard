import { SAMPLE_PAGES, imgUrl } from '@/lib/images'

// A horizontal filmstrip of finished sample pages — the studio's proof of work.
export function SampleStrip() {
  return (
    <div className="-mx-6 overflow-x-auto px-6 no-scrollbar">
      <div className="flex min-w-max gap-5 pb-1">
        {SAMPLE_PAGES.map((page, i) => (
          <figure
            key={page.rel}
            className="reveal group w-[min(64vw,232px)] shrink-0"
            style={{ ['--i' as string]: i + 1 }}
          >
            <div className="aspect-[3/4] overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-deep shadow-[0_30px_50px_-35px_rgba(30,26,58,0.5)]">
              <img
                src={imgUrl(page.rel)}
                alt={`Sample page — ${page.caption}`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]"
              />
            </div>
            <figcaption className="mt-3 font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
              {page.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

import { TINGALAND_CAST, TINGALAND_SETTINGS, SAMPLE_PAGES, imgUrl } from '@/lib/images'

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden className="block h-px w-7 bg-brand-gold" />
      <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-lavender">
        {children}
      </span>
    </span>
  )
}

export function TingalandGallery() {
  return (
    <div className="flex flex-col gap-14">
      {/* The cast */}
      <div className="flex flex-col gap-6">
        <SubHead>The cast · 8 design-locked characters</SubHead>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          {TINGALAND_CAST.map((c) => (
            <figure key={c.rel} className="group flex flex-col items-center gap-2">
              <div className="aspect-square w-full overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-cream p-1.5">
                <img
                  src={imgUrl(c.rel)}
                  alt={c.name}
                  loading="lazy"
                  className="h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-105"
                />
              </div>
              <figcaption className="font-sans text-[0.62rem] uppercase tracking-label text-brand-slate text-center">
                {c.name}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="flex flex-col gap-6">
        <SubHead>Settings · 7 painted backgrounds</SubHead>
        <div className="-mx-6 overflow-x-auto px-6 no-scrollbar">
          <div className="flex min-w-max gap-4 pb-1">
            {TINGALAND_SETTINGS.map((s) => (
              <figure key={s.rel} className="group w-[min(72vw,320px)] shrink-0">
                <div className="aspect-video overflow-hidden rounded-brand border border-brand-pale-dusk bg-brand-deep">
                  <img
                    src={imgUrl(s.rel)}
                    alt={s.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]"
                  />
                </div>
                <figcaption className="mt-2.5 font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
                  {s.name}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>

      {/* Finished pages */}
      <div className="flex flex-col gap-6">
        <SubHead>Finished pages</SubHead>
        <div className="-mx-6 overflow-x-auto px-6 no-scrollbar">
          <div className="flex min-w-max gap-5 pb-1">
            {SAMPLE_PAGES.map((page) => (
              <figure key={page.rel} className="group w-[min(60vw,210px)] shrink-0">
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
      </div>
    </div>
  )
}

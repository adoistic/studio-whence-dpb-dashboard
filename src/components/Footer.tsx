import { BrandLockup } from './BrandLockup'

export function Footer({ sha, lastUpdate }: { sha?: string; lastUpdate?: string }) {
  return (
    <footer className="surface-deep grain relative mt-28 overflow-hidden">
      <div className="relative mx-auto flex max-w-[1200px] flex-col gap-10 px-6 py-16 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3">
          <BrandLockup size="md" />
          <p className="font-serif italic text-xl text-brand-gold">Stories in becoming.</p>
          <p className="max-w-xs font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/55">
            Studio Whence × Diamond Pocket Books
          </p>
        </div>
        <div className="flex flex-col gap-1.5 font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/55 md:items-end">
          {sha && <span>build · {sha.slice(0, 7)}</span>}
          {lastUpdate && <span>data refreshed · {lastUpdate}</span>}
        </div>
      </div>
    </footer>
  )
}

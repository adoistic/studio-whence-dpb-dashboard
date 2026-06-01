import { BrandLockup } from './BrandLockup'

export function Footer({ sha, lastUpdate }: { sha?: string; lastUpdate?: string }) {
  return (
    <footer className="border-t border-brand-pale-dusk mt-32 px-6 py-12">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <BrandLockup size="md" />
          <p className="font-serif italic text-brand-lavender">Stories in becoming.</p>
        </div>
        <div className="text-xs uppercase tracking-eyebrow font-sans text-brand-slate flex flex-col gap-1 md:items-end">
          {sha && <span>build · {sha.slice(0, 7)}</span>}
          {lastUpdate && <span>updated · {lastUpdate}</span>}
        </div>
      </div>
    </footer>
  )
}

export function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-3">
        <span aria-hidden className="block h-px w-7 bg-brand-gold" />
        <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-lavender">
          {kicker}
        </span>
      </span>
      <h2 className="font-serif font-light text-brand-indigo text-3xl md:text-4xl">{title}</h2>
    </div>
  )
}

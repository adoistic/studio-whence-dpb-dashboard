export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span aria-hidden className="inline-block w-7 h-px bg-brand-gold" />
      <span className="text-xs uppercase tracking-eyebrow font-sans font-medium text-brand-lavender">
        {children}
      </span>
    </div>
  )
}

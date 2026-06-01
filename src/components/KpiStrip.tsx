export type Kpi = {
  label: string
  value: number
  formatter?: 'million' | 'default'
}

function formatValue(value: number, formatter: Kpi['formatter'] = 'default'): string {
  if (formatter === 'million') {
    const m = value / 1_000_000
    // Drop trailing .0 — e.g. 10.0 → "10 million", 9.5 → "9.5 million"
    const rounded = parseFloat(m.toFixed(1))
    return `${rounded} million`
  }
  return value.toLocaleString('en-US')
}

export function KpiStrip({ kpis, tone = 'light' }: { kpis: Kpi[]; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark'
  const numberColor = dark ? 'text-brand-cream' : 'text-brand-indigo'
  const labelColor = dark ? 'text-brand-pale-dusk/70' : 'text-brand-slate'
  const divide = dark ? 'sm:divide-white/10' : 'sm:divide-brand-pale-dusk'

  return (
    <dl className={`grid grid-cols-2 sm:grid-cols-4 sm:divide-x ${divide}`}>
      {kpis.map((kpi, i) => (
        <div
          key={kpi.label}
          className="reveal flex flex-col gap-3 sm:px-7 first:sm:pl-0 py-4 sm:py-0"
          style={{ ['--i' as string]: i + 2 }}
        >
          <dd className={`font-serif font-light leading-[0.9] m-0 text-4xl md:text-[3.25rem] ${numberColor}`}>
            {formatValue(kpi.value, kpi.formatter)}
          </dd>
          <div className="flex flex-col gap-2">
            <span aria-hidden className="block w-7 h-px bg-brand-gold" />
            <dt className={`text-[0.7rem] uppercase tracking-label font-sans ${labelColor}`}>
              {kpi.label}
            </dt>
          </div>
        </div>
      ))}
    </dl>
  )
}

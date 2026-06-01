import { GoldRule } from '@/components/GoldRule'

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

export function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  return (
    <dl className="grid grid-cols-2 md:grid-cols-4 gap-8">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="flex flex-col gap-2">
          <dd className="text-5xl font-serif font-light text-brand-indigo leading-none m-0">
            {formatValue(kpi.value, kpi.formatter)}
          </dd>
          <div className="flex flex-col gap-1">
            <GoldRule />
            <dt className="text-xs uppercase tracking-label font-sans text-brand-slate">
              {kpi.label}
            </dt>
          </div>
        </div>
      ))}
    </dl>
  )
}

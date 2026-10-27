'use client'

/**
 * Colour / Black and white switch for a back-matter section whose pages also come
 * in a black-and-white edition (an entry carrying `bwKey`). Same design, one ink.
 */
export type Ink = 'colour' | 'bw'

const PILL =
  'rounded-full border px-3 py-1 font-sans text-[0.68rem] uppercase tracking-label transition-colors'
const ON = 'border-brand-indigo bg-brand-indigo text-white'
const OFF = 'border-brand-pale-dusk text-brand-slate hover:border-brand-indigo'

export function InkSwitch({ ink, onChange }: { ink: Ink; onChange: (ink: Ink) => void }) {
  return (
    <div role="group" aria-label="Colour or black and white" className="flex flex-wrap gap-2">
      {(
        [
          ['colour', 'Colour'],
          ['bw', 'Black and white'],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          aria-pressed={ink === k}
          onClick={() => onChange(k)}
          className={`${PILL} ${ink === k ? ON : OFF}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** The key to show for an entry in the chosen ink (colour when it has no B&W twin). */
export function inkKey(e: { key: string; bwKey?: string }, ink: Ink): string {
  return ink === 'bw' && e.bwKey ? e.bwKey : e.key
}

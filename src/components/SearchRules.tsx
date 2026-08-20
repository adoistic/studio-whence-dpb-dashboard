'use client'

/** The grammar, stated where it is used. A search language nobody can see is a
 *  search language nobody uses. */
const RULES: { input: string; means: string }[] = [
  { input: 'ambani', means: 'Finds close spellings too' },
  { input: '"polyester prince"', means: 'Exact phrase' },
  { input: 'ambani textile', means: 'Both must appear' },
  { input: 'ambani, textile', means: 'Both must appear' },
  { input: 'mill | textile', means: 'Either one' },
  { input: 'ambani, mill | textile', means: 'Ambani, and either mill or textile' },
]

export function SearchRules() {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 font-sans text-[0.7rem] text-brand-slate">
      {RULES.map((rule) => (
        <div key={rule.input} className="contents">
          <dt className="whitespace-nowrap font-mono text-brand-indigo">{rule.input}</dt>
          <dd>{rule.means}</dd>
        </div>
      ))}
    </dl>
  )
}

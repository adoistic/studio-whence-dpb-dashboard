'use client'

/**
 * Pricing panel — set what a page is worth.
 *
 * Three levels, most general first, because that is the order somebody actually
 * thinks in: a studio default, a rate per line, then an override for the one
 * book that is not like the others.
 *
 * Every input is a draft until saved, and a saved value is re-read from
 * Firestore rather than assumed, so the panel can never show a rate the database
 * does not hold.
 */

import { useMemo, useState } from 'react'
import type { Comic, Line } from '@/types/content'
import {
  clearComicRate,
  clearLineRate,
  comicKey,
  formatMoney,
  lineRate,
  rateFor,
  seedLineRates,
  setComicRate,
  setDefaultRate,
  setLineRate,
  type PricingConfig,
} from '@/lib/pricing'

const CARD = 'rounded-lg border border-brand-pale-dusk bg-white p-5'
const LABEL = 'font-sans text-[0.62rem] uppercase tracking-label text-brand-slate'
const INPUT =
  'w-28 rounded border border-brand-pale-dusk px-2 py-1 text-right font-sans text-[0.8rem] tabular-nums text-brand-indigo outline-none focus:border-brand-slate'
const BTN =
  'rounded-full border border-brand-pale-dusk px-3 py-1 font-sans text-[0.7rem] text-brand-slate transition hover:border-brand-slate disabled:cursor-not-allowed disabled:opacity-40'
const BTN_PRIMARY =
  'rounded-full border border-brand-indigo bg-brand-indigo px-3 py-1 font-sans text-[0.7rem] text-white transition hover:bg-brand-indigo/90 disabled:cursor-not-allowed disabled:opacity-40'

/**
 * Parse a rate the way a person types one: "₹250", "1,200", " 300 ".
 * Returns null for anything that is not a non-negative number, so a typo can
 * never be written as NaN and silently zero out a line's value.
 */
function parseRate(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, '')
  if (cleaned === '') return null
  const v = Number(cleaned)
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : null
}

export function PricingPanel({
  pricing,
  lines,
  comics,
  email,
  onSaved,
}: {
  pricing: PricingConfig | null
  lines: Line[] | null
  comics: Comic[]
  email: string
  onSaved: () => void
}) {
  const currency = pricing?.currency ?? 'INR'
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [comicQuery, setComicQuery] = useState('')

  // Line slugs come from the comics themselves, not just the catalog, so a line
  // that exists in content but has no `lines` doc yet is still priceable.
  const lineSlugs = useMemo(() => {
    const s = new Set<string>(comics.map((c) => c.line))
    for (const l of lines ?? []) s.add(l.slug)
    return Array.from(s).sort()
  }, [comics, lines])

  const titleOf = (slug: string) => lines?.find((l) => l.slug === slug)?.title ?? slug

  const overridden = useMemo(
    () => comics.filter((c) => rateFor(c, pricing).source === 'comic'),
    [comics, pricing],
  )

  const matches = useMemo(() => {
    const q = comicQuery.trim().toLowerCase()
    if (!q) return []
    return comics
      .filter(
        (c) =>
          (c.title ?? '').toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q) ||
          c.line.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [comics, comicQuery])

  async function run(key: string, fn: () => Promise<void>, msg: string) {
    setBusy(key)
    setNote(null)
    try {
      await fn()
      setDrafts((d) => {
        const next = { ...d }
        delete next[key]
        return next
      })
      setNote(msg)
      onSaved()
    } catch (e) {
      setNote(`Could not save — ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const draftFor = (key: string, fallback: number) => drafts[key] ?? String(fallback)
  const setDraft = (key: string, v: string) => setDrafts((d) => ({ ...d, [key]: v }))

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-light text-brand-indigo">Pricing</h2>
          <p className="mt-1 max-w-prose font-sans text-[0.75rem] leading-relaxed text-brand-slate">
            A rate per page. A comic uses its own override if it has one, otherwise its line’s rate,
            otherwise the studio default.
          </p>
        </div>
        {note ? (
          <p className="font-sans text-[0.72rem] text-brand-indigo" role="status">
            {note}
          </p>
        ) : null}
      </div>

      {/* ── Studio default ── */}
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className={LABEL}>Studio default</div>
            <p className="mt-1 font-sans text-[0.72rem] text-brand-slate">
              Applies to any line with no rate of its own.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-sans text-[0.8rem] text-brand-slate">₹</span>
            <input
              className={INPUT}
              value={draftFor('__default', pricing?.defaultRatePerPage ?? 250)}
              onChange={(e) => setDraft('__default', e.target.value)}
              inputMode="numeric"
              aria-label="Studio default rate per page"
            />
            <span className="font-sans text-[0.72rem] text-brand-slate">/ page</span>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy !== null || parseRate(draftFor('__default', pricing?.defaultRatePerPage ?? 250)) === null}
              onClick={() => {
                const v = parseRate(draftFor('__default', pricing?.defaultRatePerPage ?? 250))
                if (v === null) return
                void run('__default', () => setDefaultRate(v, email), `Default set to ${formatMoney(v, currency)} a page.`)
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* ── Per line ── */}
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={LABEL}>Rate per line</div>
          <button
            type="button"
            className={BTN}
            disabled={busy !== null}
            onClick={() =>
              void run(
                '__seed',
                () => seedLineRates(lineSlugs, pricing?.defaultRatePerPage ?? 250, email),
                `All ${lineSlugs.length} lines set to ${formatMoney(pricing?.defaultRatePerPage ?? 250, currency)} a page.`,
              )
            }
            title="Write the current studio default onto every line"
          >
            Set every line to the default
          </button>
        </div>

        <table className="mt-4 w-full border-collapse">
          <tbody>
            {lineSlugs.map((slug) => {
              const resolved = lineRate(slug, pricing)
              const count = comics.filter((c) => c.line === slug).length
              const key = `line__${slug}`
              return (
                <tr key={slug} className="border-b border-brand-pale-dusk/60 last:border-0">
                  <td className="py-2 pr-3">
                    <div className="text-[0.85rem] text-brand-indigo">{titleOf(slug)}</div>
                    <div className="font-sans text-[0.68rem] text-brand-slate">
                      {count} {count === 1 ? 'comic' : 'comics'}
                      {resolved.source === 'default' ? ' · using the studio default' : ''}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-sans text-[0.8rem] text-brand-slate">₹</span>
                      <input
                        className={INPUT}
                        value={draftFor(key, resolved.rate)}
                        onChange={(e) => setDraft(key, e.target.value)}
                        inputMode="numeric"
                        aria-label={`Rate per page for ${titleOf(slug)}`}
                      />
                      <button
                        type="button"
                        className={BTN_PRIMARY}
                        disabled={busy !== null || parseRate(draftFor(key, resolved.rate)) === null}
                        onClick={() => {
                          const v = parseRate(draftFor(key, resolved.rate))
                          if (v === null) return
                          void run(key, () => setLineRate(slug, v, email), `${titleOf(slug)} set to ${formatMoney(v, currency)} a page.`)
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className={BTN}
                        disabled={busy !== null || resolved.source === 'default'}
                        onClick={() =>
                          void run(key, () => clearLineRate(slug, email), `${titleOf(slug)} back to the studio default.`)
                        }
                        title="Remove this line's rate so it follows the studio default"
                      >
                        Reset
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Per comic ── */}
      <div className={CARD}>
        <div className={LABEL}>Override a single comic</div>
        <p className="mt-1 font-sans text-[0.72rem] text-brand-slate">
          For the one book priced differently from the rest of its line.
        </p>

        <input
          value={comicQuery}
          onChange={(e) => setComicQuery(e.target.value)}
          placeholder="Search comics by title, slug or line…"
          aria-label="Search comics to override"
          className="mt-3 w-full rounded border border-brand-pale-dusk px-3 py-1.5 font-sans text-[0.78rem] text-brand-indigo outline-none placeholder:text-brand-slate/60 focus:border-brand-slate"
        />

        {matches.length > 0 ? (
          <table className="mt-3 w-full border-collapse">
            <tbody>
              {matches.map((c) => {
                const key = `comic__${comicKey(c.line, c.slug)}`
                const resolved = rateFor(c, pricing)
                return (
                  <tr key={key} className="border-b border-brand-pale-dusk/60 last:border-0">
                    <td className="py-2 pr-3">
                      <div className="text-[0.85rem] text-brand-indigo">{c.title || c.slug}</div>
                      <div className="font-sans text-[0.68rem] text-brand-slate">
                        {titleOf(c.line)} · {c.pages?.count ?? 0} pages ·{' '}
                        {resolved.source === 'comic'
                          ? 'own rate'
                          : resolved.source === 'line'
                            ? 'line rate'
                            : 'studio default'}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-sans text-[0.8rem] text-brand-slate">₹</span>
                        <input
                          className={INPUT}
                          value={draftFor(key, resolved.rate)}
                          onChange={(e) => setDraft(key, e.target.value)}
                          inputMode="numeric"
                          aria-label={`Rate per page for ${c.title || c.slug}`}
                        />
                        <button
                          type="button"
                          className={BTN_PRIMARY}
                          disabled={busy !== null || parseRate(draftFor(key, resolved.rate)) === null}
                          onClick={() => {
                            const v = parseRate(draftFor(key, resolved.rate))
                            if (v === null) return
                            void run(
                              key,
                              () => setComicRate(c.line, c.slug, v, email),
                              `${c.title || c.slug} set to ${formatMoney(v, currency)} a page.`,
                            )
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : comicQuery.trim() ? (
          <p className="mt-3 font-sans text-[0.75rem] text-brand-slate">No comic matches that.</p>
        ) : null}

        {overridden.length > 0 ? (
          <div className="mt-5 border-t border-brand-pale-dusk pt-4">
            <div className={LABEL}>Currently overridden ({overridden.length})</div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {overridden.map((c) => {
                const key = `clear__${comicKey(c.line, c.slug)}`
                const r = rateFor(c, pricing)
                return (
                  <li key={key} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[0.8rem] text-brand-indigo">
                      {c.title || c.slug}
                      <span className="ml-2 font-sans text-[0.68rem] text-brand-slate">{titleOf(c.line)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-sans text-[0.8rem] tabular-nums text-brand-indigo">
                        {formatMoney(r.rate, currency)}
                      </span>
                      <button
                        type="button"
                        className={BTN}
                        disabled={busy !== null}
                        onClick={() =>
                          void run(
                            key,
                            () => clearComicRate(c.line, c.slug, email),
                            `${c.title || c.slug} back to its line rate.`,
                          )
                        }
                      >
                        Remove
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}

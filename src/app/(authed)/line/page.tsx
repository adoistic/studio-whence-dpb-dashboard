'use client'

import { useContent } from '@/lib/content'
import { LinePageShell } from '@/components/LinePageShell'
import { INTROS } from '@/lib/intros'

// Read the first path segment of the browser URL as the line slug. This single
// page is served for every /<line> URL via the Firebase Hosting rewrite
// (/* → /line.html, added in Task 2.7); the browser URL is preserved, so
// window.location.pathname gives the real line slug. SSR/no-window is guarded.
// NOTE: /line itself is a reserved path — slug "line" is never a real line, so it
// resolves to the not-found state, which is harmless.
function lineSlugFromPath(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname.replace(/^\/+/, '').split('/')[0] ?? ''
}

export default function LinePage() {
  const { content, loading, error } = useContent()
  const slug = lineSlugFromPath()

  if (loading) return <LoadingState />
  if (error || !content) return <ErrorState />

  const line = content.lines.find((l) => l.slug === slug)
  if (!line) return <NotFoundState slug={slug} />

  // INTROS[slug] is typed non-undefined (tsconfig has no noUncheckedIndexedAccess),
  // but at runtime an unknown slug yields undefined — the guard is load-bearing.
  const Intro = INTROS[slug]
  return <LinePageShell line={line} introMdx={Intro ? <Intro /> : null} />
}

// ── Quiet states ──────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
        Loading…
      </p>
    </div>
  )
}

function ErrorState() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
      <p className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
        Couldn’t load
      </p>
      <p className="max-w-xs font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/55">
        Please reload the page.
      </p>
    </div>
  )
}

function NotFoundState({ slug }: { slug: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
      <p className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
        Line not found
      </p>
      <p className="max-w-xs font-sans text-[0.7rem] uppercase tracking-label text-brand-pale-dusk/55">
        No line matches “{slug}”.
      </p>
    </div>
  )
}

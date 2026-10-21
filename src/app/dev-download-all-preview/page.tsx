'use client'

/**
 * DEV-ONLY visual harness for "Download all" on a comic's page.
 *
 * The real comic page sits behind Google sign-in, which makes visual QA of the panel
 * impossible without a session. This route renders the masthead and the panel with
 * OBVIOUSLY FAKE fixture data (no real titles, no real keys — this repo is public and
 * carries code only). In a production build it renders nothing. Downloading from here
 * fails by design: there is no session to sign the fake keys.
 */

import { ComicDownloadAll } from '@/components/ComicDownloadAll'
import type { Comic } from '@/types/content'
import type { CastDoc } from '@/lib/castModel'

const A = 'artifacts/comics/alpha/sample'
const I = 'images/comics/alpha/sample'

const comic = {
  title: 'Sample Hero — The Long Road', subject: 'Sample Hero', line: 'alpha', slug: 'sample', subject_slug: 'sample-hero',
  series: 'Sample Series', comic_number: 1, status: 'published', version: 3, updated: '2026-09-28',
  logline: 'A boy walks a long road and keeps walking. A sample book for checking the layout.',
  originalLanguage: 'en', draftKey: 'drafts/alpha/sample.html',
  languages: [
    { code: 'en', label: 'English', draftKey: 'drafts/alpha/sample.html', isOriginal: true },
    { code: 'hi', label: 'हिंदी', draftKey: 'drafts/alpha/sample.hi.html', isOriginal: false },
  ],
  pages: { hasPages: true, count: 48, coverKey: `${I}/cover.jpg`, covers: [{ lang: 'hi', key: `${I}/cover-hi.jpg` }] },
  insideCovers: { language: 'English', images: [
    { key: `${A}/inside-covers/inside-front-cover.png`, label: 'Inside front cover' },
    { key: `${A}/inside-covers/inside-back-cover.png`, label: 'Inside back cover' },
  ] },
  editablePpt: { key: `${A}/sample-editable.pptx`, bytes: 28_000_000, filename: 'x.pptx' },
  indesign: { key: `${A}/sample-indesign.zip`, bytes: 42_000_000, filename: 'x.zip', deckKey: `${A}/sample-editable.pptx`, deckBytes: 28_000_000,
    trims: { '450x648': { key: `${A}/trim.zip`, bytes: 41_000_000, label: '6.25 × 9 in', deckKey: `${A}/sample-editable.pptx`, deckBytes: 28_000_000 } } },
  indesignAll: { key: `${A}/all.zip`, bytes: 43_000_000, filename: 'all.zip', languages: ['English', 'Hindi'] },
  deckPdf: { editions: [{ language: 'English', key: `${A}/en.pdf`, bytes: 30_000_000 }, { language: 'Hindi', key: `${A}/hi.pdf`, bytes: 31_000_000 }] },
  translations: [{ language: 'Hindi', script: { key: 'docs/x/script-hi.md', bytes: 50_000 },
    editablePpt: { key: `${A}/hi.pptx`, bytes: 28_500_000, filename: 'y.pptx' }, indesign: { key: `${A}/hi.zip`, bytes: 42_400_000, filename: 'hi.zip' } }],
  scriptExports: { layout: 'panel', docxKey: `${A}/panels.docx`, pdfKey: `${A}/panels.pdf` },
  docs: { generatedAt: '2026-10-13', bundleKey: 'docs/x/bundle.md', bundleBytes: 100_000, zipKey: 'docs/x/pack.zip', zipBytes: 30_000,
    items: [{ type: 'concept-note', label: 'Concept note', readKey: 'r', downloadKey: 'docs/x/c.md', bytes: 6_000 }] },
  coverOptions: { language: 'en', options: [
    { key: `${A}/cover-options/opt1.jpg`, label: 'Option 1' }, { key: `${A}/cover-options/opt1-clean.jpg`, label: 'Option 1 — clean plate (no titling)' },
  ] },
  backCover: { language: 'en', image: { key: `${A}/back-cover/back-cover.png`, label: 'Back cover' } },
  activities: { language: 'en', pages: [{ key: `${A}/activities/a1.png`, label: 'Story quiz' }] },
} as unknown as Comic

const cast: CastDoc = {
  comicId: 'alpha__sample', line: 'alpha', slug: 'sample', title: comic.title, subject_slug: 'sample-hero', program_slug: 'p',
  library: false, source: 'dev',
  counts: { characters: 1, named: 1, generalized: 0, shared: 0, drawn: 1, undrawn: 0, versions: 1, versionsDrawn: 1 },
  people: [{ id: 'hero', line: 'alpha', name: 'Sample Hero', kind: 'named', pages: [1], versions: [
    { stage: 'base', label: 'Main look', drawn: true, key: 'artifacts/characters/alpha/hero/base.png', bytes: 3_000_000, pages: [1] },
  ] }],
}

const figure = {
  figure: { series: 's', slug: 'sample-hero', sources_count: 1, words: 90_000 },
  sources: [{ slug: 'a-book', kind: 'book' as const, title: 'A Long Book', words: 90_000, files: [{ path: 'p/1.md', title: 'One' }],
    bundle: { files: 1, md: { key: 'bundles/x/a.md', bytes: 500_000 }, pdf: { key: 'bundles/x/a.pdf', bytes: 2_000_000 } } }],
}

export default function DevDownloadAllPreview() {
  if (process.env.NODE_ENV === 'production') return null
  return (
    <section className="surface-deep grain relative overflow-hidden">
      <div className="relative mx-auto max-w-[1100px] px-6 py-14 md:py-16">
        <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">{comic.subject}</span>
        <h1 className="mt-4 font-serif font-light leading-[1.0] text-brand-cream text-[2.1rem] md:text-[3rem]">{comic.title}</h1>
        <p className="mt-5 max-w-2xl font-serif text-lg leading-relaxed text-brand-pale-dusk/80">{comic.logline}</p>
        <div className="mt-8">
          <ComicDownloadAll comic={comic} figure={figure} cast={cast} threads={[]} />
        </div>
      </div>
    </section>
  )
}

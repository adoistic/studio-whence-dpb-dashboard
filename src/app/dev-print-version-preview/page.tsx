'use client'

/**
 * DEV-ONLY visual harness for the "Print version" section of a comic page.
 *
 * The comic page sits behind sign-in, so this renders the section with OBVIOUSLY FAKE fixture data
 * (this repo is public and carries code only) and placeholder images drawn here. In a production
 * build it renders nothing. Downloads fail by design: there is no session to sign the fake keys.
 */

import { PrintVersion } from '@/components/PrintVersion'
import type { Comic } from '@/types/content'

const P = 'artifacts/comics/alpha/sample/print-version'

const comic: Comic = {
  title: 'Sample Hero — The Long Road',
  line: 'alpha',
  status: 'published',
  slug: 'sample',
  subject_slug: null,
  printVersion: {
    intro: 'A sample paragraph for checking the layout. The real one says which press the book is for.',
    label: 'Print version',
    summary: 'Made for a sample press on sample paper. Only black areas print solid; dark greys are held to 62%.',
    press: 'Sample press on sample paper',
    pages: 48,
    files: {
      pdf: { key: `${P}/sample-print.pdf`, bytes: 61_000_000, filename: 'sample-print.pdf' },
      tiff: { key: `${P}/sample-tiff.zip`, bytes: 58_000_000, filename: 'sample-tiff.zip' },
    },
    testPack: { key: `${P}/sample-test.pdf`, bytes: 9_400_000, filename: 'sample-test.pdf', pages: [3, 7, 12] },
    compare: {
      viewPrefix: P,
      versions: [
        { id: 'as-sent', label: 'As sent' },
        { id: 'print', label: 'Print version' },
      ],
      views: [
        { id: 'file', label: 'Our file', note: 'The page exactly as we send it.' },
        { id: 'digital-test', label: 'Digital test print', note: 'Sample note about the measured test print.' },
        { id: 'press-estimate', label: 'Expected on the paper', note: 'Sample note about the estimate.' },
      ],
      quickPages: [
        { page: 3, why: 'a sample reason this page is hard' },
        { page: 7, why: 'another sample reason' },
        { page: 12, why: 'a light page' },
      ],
    },
  },
}

function placeholder(key: string): string {
  const parts = key.split('/')
  const [version, view, file] = parts.slice(-3)
  const dark = version === 'as-sent' ? '#2a2a2a' : '#555'
  const bg = view === 'file' ? '#ffffff' : '#efe7d6'
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 700'><rect width='500' height='700' fill='${bg}'/>` +
    `<rect x='30' y='30' width='440' height='300' fill='${dark}'/><rect x='30' y='350' width='210' height='320' fill='${dark}'/>` +
    `<rect x='260' y='350' width='210' height='320' fill='#999'/><text x='250' y='190' fill='#fff' font-size='26' ` +
    `text-anchor='middle' font-family='sans-serif'>${version} · ${view} · ${file}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export default function Page() {
  if (process.env.NODE_ENV === 'production') return null
  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <PrintVersion comic={comic} urlFor={placeholder} />
    </main>
  )
}

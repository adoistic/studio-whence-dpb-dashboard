// LLM-ready ZIP: README.md + comic.json + cover.jpg + pages/page-NN.jpg.
// Pure over (model, fetched images); jszip is imported here and this module
// is itself lazy-imported by the button, keeping it out of the initial bundle.
import JSZip from 'jszip'
import type { ExportComicModel } from '@/lib/exportModel'

export type ImageRef = 'cover' | number
export interface FetchedImage { bytes: Uint8Array; width: number; height: number }
export type ImageMap = Map<ImageRef, FetchedImage>

export function buildComicJson(model: ExportComicModel): string {
  return JSON.stringify(
    {
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      comic: model.comic,
      options: model.options,
      hasScript: model.hasScript,
      cover: model.cover,
      pages: model.pages,
      generalComments: model.generalComments,
    },
    null,
    2,
  )
}

export function buildReadme(model: ExportComicModel): string {
  const scriptLine = model.hasScript
    ? '- `script`: the comic script for that page — panels, each with an `art` direction and `beats` (caption / dialogue / sfx).'
    : '- `script` is null throughout: this comic has no published script; the comments are the editorial layer.'
  return [
    `# ${model.comic.title} — export`,
    '',
    'This package is a comic-book review bundle. Read `comic.json` first.',
    '',
    "- `comic.json` describes every page. Each entry's `image` field is a path",
    '  inside this zip (e.g. `pages/page-01.jpg`); open that file to see the page.',
    scriptLine,
    '- `comments`: reviewer feedback threads on that page. `anchor.snapshot` is the',
    '  exact text the comment was anchored to; `status` is the workflow state',
    '  (open / in_progress / resolved / deferred / wont_fix); `replies` are',
    '  chronological. `alsoOnPages` lists other pages the same thread touches',
    '  (the thread is repeated there — dedupe by `id`).',
    '- `generalComments`: threads about the whole comic, not one page.',
    '- A page with `image: null` had comments but no published image at export time.',
    '',
    'Pages are 1-indexed; `pages/page-NN.jpg` numbering matches `page` fields.',
  ].join('\n')
}

export async function buildExportZip(model: ExportComicModel, images: ImageMap): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('README.md', buildReadme(model))
  zip.file('comic.json', buildComicJson(model))
  const cover = images.get('cover')
  if (model.cover && cover) zip.file('cover.jpg', cover.bytes)
  for (const p of model.pages) {
    if (!p.image) continue
    const img = images.get(p.page)
    if (img) zip.file(p.image, img.bytes)
  }
  return zip.generateAsync({ type: 'uint8array' })
}

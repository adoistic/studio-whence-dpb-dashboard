'use client'

/**
 * downloadAllRun.ts — a "Download all" plan, made into one zip.
 *
 * Files already in R2 stream straight into the zip (`downloadZip`). Each file the browser
 * has to make is bound here to the builder the comic page's own buttons use, so a file in
 * the zip is the file its button gives: the PDFs (`lib/comicPdf`), the Word scripts
 * (`ComicDocxButton`), the review copies (the Export… model, blocks and zip), the
 * character contact sheet (`lib/characterPdf`), and a research source's text when its
 * pre-built copy is stale (`lib/researchDownloads`).
 *
 * CALL IT STRAIGHT FROM THE CLICK, before any `await`: the save dialog needs the click's
 * user activation. Every builder is imported lazily, inside the zip, never before it.
 */

import type { Comic } from '@/types/content'
import { downloadZip, type ZipItem, type ZipProgress, type ZipResult } from '@/lib/downloads'
import { comicLanguages } from '@/lib/comicLanguages'
import { appliesToLanguage } from '@/lib/feedbackTypes'
import {
  bundleReadme,
  type BundleContext,
  type BundleGroupId,
  type BundleMaker,
  type BundlePlan,
} from '@/lib/downloadAll'

export interface RunDownloadAll {
  comic: Comic
  plan: BundlePlan
  ctx: BundleContext
  selected: Set<BundleGroupId>
  onProgress?: (p: ZipProgress) => void
  signal?: AbortSignal
  /** `2026-10-21`; defaults to today. */
  today?: string
  /** Test seams, handed to `downloadZip`. */
  noPicker?: boolean
  sink?: (blob: Blob, filename: string) => void
  /** Test seam: how a generated file is made. */
  make?: (m: BundleMaker) => Promise<Uint8Array>
}

/** The zip items for the groups chosen, in plan order. */
export function zipItemsForPlan(
  plan: BundlePlan,
  selected: Set<BundleGroupId>,
  make: (m: BundleMaker) => Promise<Uint8Array>,
): ZipItem[] {
  const items: ZipItem[] = []
  for (const g of plan.groups) {
    if (!selected.has(g.id)) continue
    for (const it of g.items) {
      if (it.key) items.push({ path: it.path, key: it.key, bytes: it.bytes })
      else if (it.text !== undefined) items.push({ path: it.path, text: it.text })
      else if (it.make) {
        const m = it.make
        items.push({ path: it.path, data: () => make(m), bytes: it.bytes })
      }
    }
  }
  return items
}

export function runDownloadAll(o: RunDownloadAll): Promise<ZipResult> {
  const today = o.today ?? new Date().toISOString().slice(0, 10)
  const items = zipItemsForPlan(o.plan, o.selected, o.make ?? makerFor(o.comic, o.ctx, o.signal))
  return downloadZip(o.plan.zipName, items, {
    signal: o.signal,
    onProgress: o.onProgress,
    noPicker: o.noPicker,
    sink: o.sink,
    readme: (failed, written) => bundleReadme(o.plan, o.comic, { selected: o.selected, failed, written, today }),
    readmePath: `${o.plan.root}/README.txt`,
  })
}

/**
 * The builders, bound to one comic. Work two files share (the original draft, the review
 * copies' page images and model) is done once per download.
 */
export function makerFor(comic: Comic, ctx: BundleContext, signal?: AbortSignal): (m: BundleMaker) => Promise<Uint8Array> {
  const memo = new Map<string, Promise<unknown>>()
  function once<T>(key: string, run: () => Promise<T>): Promise<T> {
    let p = memo.get(key) as Promise<T> | undefined
    if (!p) {
      p = run()
      memo.set(key, p)
      p.catch(() => memo.delete(key))
    }
    return p
  }
  const original = (comic.originalLanguage ?? 'en').toLowerCase()

  const draftHtml = (key: string) =>
    once(`draft:${key}`, async () => (await import('@/lib/dataApi')).readMarkdown(key))

  // The review copies are the Export… button's three formats, built from the ORIGINAL
  // language's script and every thread on it the viewer can see, resolved ones included.
  const reviewModel = () =>
    once('review-model', async () => {
      const { buildExportModel } = await import('@/lib/exportModel')
      const { parseDraftHtml } = await import('@/lib/comicDocx')
      const key = comicLanguages(comic).find((l) => l.isOriginal)?.draftKey
      let html: string | null = null
      if (key && ctx.hasDraft !== false) {
        try { html = await draftHtml(key) } catch { html = null }
      }
      const threads = (ctx.threads ?? []).filter((t) => appliesToLanguage(t.root, original, original))
      return buildExportModel({
        comic,
        threads,
        draftPages: html ? parseDraftHtml(html).pages : null,
        options: { includeComments: true, includeScript: !!html, includeResolved: true },
      })
    })
  const reviewImages = () =>
    once('review-images', async () => (await import('@/lib/exportFetch')).fetchExportImages(comic))

  return async (m: BundleMaker): Promise<Uint8Array> => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    switch (m.kind) {
      case 'comic-pdf': {
        const { comicPdfBytes } = await import('@/lib/comicPdf')
        return comicPdfBytes(comic, m.variant, { signal })
      }
      case 'script-docx': {
        const html = await draftHtml(m.draftKey)
        const { buildComicDocument, fetchInsideCovers } = await import('@/components/ComicDocxButton')
        const insideCovers = m.insideCovers ? await fetchInsideCovers(comic) : null
        const { doc, Packer } = await buildComicDocument(comic, html, insideCovers)
        return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer())
      }
      case 'review': {
        const [model, fetched] = await Promise.all([reviewModel(), reviewImages()])
        if (m.format === 'llm') {
          const { buildExportZip } = await import('@/lib/exportZip')
          return buildExportZip(model, fetched.images)
        }
        const blocks = await import('@/lib/exportBlocks')
        const { assembleDocx } = await import('@/lib/exportDocx')
        return m.format === 'author'
          ? assembleDocx(blocks.authorDocBlocks(model), fetched.images, 'portrait')
          : assembleDocx(blocks.sideBySideDocBlocks(model), fetched.images, 'landscape')
      }
      case 'character-pdf': {
        const { mergeCasts, drawnVersions } = await import('@/lib/castModel')
        const { buildCharacterPdf } = await import('@/lib/characterPdf')
        const all = mergeCasts(ctx.cast ? [ctx.cast] : [])
        return buildCharacterPdf({ title: comic.title, entries: drawnVersions(all), all, signal })
      }
      case 'research-md': {
        const f = ctx.figure
        const source = f?.sources.find((s) => s.slug === m.sourceSlug)
        if (!f || !source) throw new Error(`research source ${m.sourceSlug} is not loaded`)
        const { fetchTexts, figureName, sourceMarkdown } = await import('@/lib/researchDownloads')
        const texts = await fetchTexts(source.files.map((x) => x.path))
        if (texts.every((t) => t === null)) throw new Error('none of the source\'s files could be fetched')
        return new TextEncoder().encode(sourceMarkdown(source, figureName(f.figure), texts))
      }
    }
  }
}

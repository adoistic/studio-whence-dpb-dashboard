'use client'

/**
 * researchDownloads.ts — the research library, downloadable.
 *
 * Every level Adnan asked for:
 *   - one chapter or transcript, as its own Markdown file;
 *   - one source (a book with chapters, a dossier), as ONE Markdown file or as a zip of
 *     its files;
 *   - everything for a subject, as one zip with a folder per kind and per source.
 *
 * THE FAST PATH IS PRE-BUILT. `tools/publish_research_bundles.py` (content repo)
 * writes each source's `.md` and `.zip` and each subject's `all.zip` to R2 and points
 * at them from the source doc (`bundle`) and the figure doc (`researchZip`). A click
 * then presigns one key and the browser downloads it directly — no assembly, no wait.
 *
 * THE FALLBACK ASSEMBLES HERE. A bundle is used only while it still describes the
 * source: its `files` count must equal the source's current file list. A source added
 * or changed after the bundles were built (or before they ever were) is assembled in
 * the browser from the same gated per-file keys, in the same shape, so the download
 * never depends on the bundles being current.
 *
 * PDFs are typeset beside the bundles (content repo `tools/research_pdf`): a file, a
 * source and the whole subject, set to be read, with "For internal use of Diamond
 * Books only" on the cover and every page. A browser cannot typeset one, so a PDF is
 * offered only while its bundle is current and is simply not shown otherwise.
 */

import type { Figure, ResearchPdf, ResearchSource } from '@/types/content'
import { resolveUrls } from '@/lib/dataApi'
import { downloadKey, downloadZip, safeFilename, saveText, uniquePaths, ZIP_FILE_MAX, ZIP_FOLDER_MAX, type ZipItem, type ZipProgress } from '@/lib/downloads'

/** The R2 key a research `path` is served from (verbatim when it already is one). */
export function researchKeyOf(path: string): string {
  const ABSOLUTE_PREFIXES = ['docs/', 'research/', 'artifacts/']
  if (ABSOLUTE_PREFIXES.some((prefix) => path.startsWith(prefix))) return path
  return `research/${path}`
}

const KIND_FOLDER: Record<string, string> = {
  book: 'Books',
  transcript: 'Transcripts',
  'topic-note': 'Notes',
  'character-dossier': 'Design & dossier',
  'design-bible': 'Design & dossier',
  characterization: 'Design & dossier',
}

const KIND_LABEL: Record<string, string> = {
  book: 'Book',
  transcript: 'Transcript',
  'topic-note': 'Topic note',
  'character-dossier': 'Character dossier',
  'design-bible': 'Design bible',
  characterization: 'Characterization',
}

export function kindFolder(kind: string): string {
  return KIND_FOLDER[kind] ?? (kind ? kind[0].toUpperCase() + kind.slice(1).replace(/-/g, ' ') : 'Other')
}

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kindFolder(kind)
}

/** A source's title for a FILE name: the index's `Source · ` prefix is a label for the
 *  list, not part of the work's name (the bundle builder drops it the same way). */
export function sourceTitle(source: Pick<ResearchSource, 'title' | 'slug'>): string {
  const t = (source.title ?? '').replace(/^\s*source\s*[·—–-]\s*/i, '').trim()
  return t || source.title || source.slug
}

export function figureName(figure: Pick<Figure, 'slug'>): string {
  return figure.slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

function numberWidth(count: number): number {
  return Math.max(2, String(count).length)
}

/** `03 Chapter Three.md` — the reading order survives every file browser's sort. */
export function numberedFileNames(source: ResearchSource): string[] {
  const w = numberWidth(source.files.length)
  return uniquePaths(source.files.map((f, i) => `${pad(i + 1, w)} ${safeFilename(f.title, 'untitled', ZIP_FILE_MAX)}.md`))
}

// ─── freshness ────────────────────────────────────────────────────────────────

export function sourceBundleIsCurrent(source: ResearchSource): boolean {
  const b = source.bundle
  return !!b && b.files === source.files.length
}

export function figureZipIsCurrent(figure: Figure, sources: ResearchSource[]): boolean {
  const z = figure.researchZip
  if (!z) return false
  const listed = sources.reduce((n, s) => n + s.files.length, 0)
  return z.files === listed && (z.sources === undefined || z.sources === sources.length)
}

// ─── one file ─────────────────────────────────────────────────────────────────

export function fileDownloadName(source: ResearchSource, fileIndex: number): string {
  const file = source.files[fileIndex]
  if (source.files.length === 1) return `${safeFilename(sourceTitle(source))}.md`
  return `${safeFilename(sourceTitle(source))} — ${safeFilename(file?.title ?? `part ${fileIndex + 1}`)}.md`
}

export async function downloadResearchFile(source: ResearchSource, fileIndex: number): Promise<void> {
  const file = source.files[fileIndex]
  if (!file) return
  await downloadKey(researchKeyOf(file.path), fileDownloadName(source, fileIndex))
}

// ─── one source ───────────────────────────────────────────────────────────────

/** The single-file form of a source: a contents list, then every file in order. */
export function sourceMarkdown(
  source: ResearchSource,
  subject: string,
  texts: (string | null)[],
  date = new Date().toISOString().slice(0, 10),
): string {
  const lines = [
    `# ${sourceTitle(source)}`,
    '',
    `${kindLabel(source.kind)} · ${(source.words ?? 0).toLocaleString('en-US')} words · ${source.files.length} files · ${subject}`,
    `Studio Whence research library · generated ${date}`,
    '',
    '## Contents',
    ...source.files.map((f, i) => `${i + 1}. ${f.title}`),
    '',
  ]
  source.files.forEach((f, i) => {
    lines.push('---', '', `<!-- source file: ${f.path} -->`, '')
    lines.push(texts[i] ?? '_This file could not be fetched when the download was made._', '')
  })
  return lines.join('\n')
}

/** Each path's text, in order; a file that cannot be fetched is null. */
export async function fetchTexts(paths: string[], concurrency = 8): Promise<(string | null)[]> {
  const keys = paths.map(researchKeyOf)
  const urls = await resolveUrls(Array.from(new Set(keys)))
  const out: (string | null)[] = new Array(paths.length).fill(null)
  let next = 0
  async function worker() {
    while (next < keys.length) {
      const i = next++
      const url = urls[keys[i]]
      if (!url) continue
      try {
        const res = await fetch(url)
        if (res.ok) out[i] = await res.text()
      } catch { /* left null, noted in the file */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker))
  return out
}

export async function downloadSourceMarkdown(figure: Figure, source: ResearchSource): Promise<void> {
  const name = `${safeFilename(sourceTitle(source))}.md`
  if (sourceBundleIsCurrent(source) && source.bundle?.md?.key) {
    await downloadKey(source.bundle.md.key, name)
    return
  }
  const texts = await fetchTexts(source.files.map((f) => f.path))
  saveText(sourceMarkdown(source, figureName(figure), texts), name)
}

function sourceReadme(source: ResearchSource, subject: string, failed: string[] = []): string {
  const names = numberedFileNames(source)
  const lines = [
    `# ${sourceTitle(source)}`,
    '',
    `${kindLabel(source.kind)} · ${(source.words ?? 0).toLocaleString('en-US')} words · ${source.files.length} files · ${subject}`,
    `Studio Whence research library · generated ${new Date().toISOString().slice(0, 10)}`,
    '',
    '| File | Title | Source path |',
    '|---|---|---|',
    ...source.files.map((f, i) => `| ${names[i]} | ${f.title} | ${f.path} |`),
  ]
  if (failed.length) lines.push('', '## Not included', '', ...failed.map((f) => `- ${f} could not be fetched`))
  return lines.join('\n') + '\n'
}

export function sourceZipItems(source: ResearchSource, folder = ''): ZipItem[] {
  const names = numberedFileNames(source)
  return source.files.map((f, i) => ({
    path: folder ? `${folder}/${names[i]}` : names[i],
    key: researchKeyOf(f.path),
  }))
}

export async function downloadSourceZip(
  figure: Figure,
  source: ResearchSource,
  onProgress?: (p: ZipProgress) => void,
): Promise<void> {
  const name = `${safeFilename(sourceTitle(source))}.zip`
  if (sourceBundleIsCurrent(source) && source.bundle?.zip?.key) {
    await downloadKey(source.bundle.zip.key, name)
    return
  }
  await downloadZip(name, sourceZipItems(source), {
    onProgress,
    readme: (failed) => sourceReadme(source, figureName(figure), failed),
  })
}

// ─── everything ───────────────────────────────────────────────────────────────

/** `Books/<book>/01 …md`, `Transcripts/<title>.md` — one folder per kind, then per source. */
export function figureZipItems(figure: Figure, sources: ResearchSource[]): ZipItem[] {
  const root = `${safeFilename(figureName(figure))} — research`
  const items: ZipItem[] = []
  const singles: { source: ResearchSource; path: string }[] = []
  const folders: { source: ResearchSource; path: string }[] = []
  for (const s of sources) {
    const dir = `${root}/${kindFolder(s.kind)}`
    if (s.files.length === 1) singles.push({ source: s, path: `${dir}/${safeFilename(sourceTitle(s), 'untitled', ZIP_FILE_MAX)}.md` })
    else folders.push({ source: s, path: `${dir}/${safeFilename(sourceTitle(s), 'untitled', ZIP_FOLDER_MAX)}` })
  }
  const singlePaths = uniquePaths(singles.map((x) => x.path))
  const folderPaths = uniquePaths(folders.map((x) => x.path))
  singles.forEach((x, i) => items.push({ path: singlePaths[i], key: researchKeyOf(x.source.files[0].path) }))
  folders.forEach((x, i) => items.push(...sourceZipItems(x.source, folderPaths[i])))
  return items
}

function figureReadme(figure: Figure, sources: ResearchSource[], failed: string[]): string {
  const name = figureName(figure)
  const lines = [
    `# ${name} — research`,
    '',
    `${sources.length} sources · ${sources.reduce((n, s) => n + s.files.length, 0)} files · ` +
      `${sources.reduce((n, s) => n + (s.words ?? 0), 0).toLocaleString('en-US')} words`,
    `Studio Whence research library · generated ${new Date().toISOString().slice(0, 10)}`,
    '',
    '| Kind | Source | Words | Files |',
    '|---|---|---:|---:|',
    ...sources.map((s) => `| ${kindLabel(s.kind)} | ${sourceTitle(s)} | ${(s.words ?? 0).toLocaleString('en-US')} | ${s.files.length} |`),
  ]
  if (failed.length) lines.push('', '## Not included', '', ...failed.map((f) => `- ${f} could not be fetched`))
  return lines.join('\n') + '\n'
}

export async function downloadFigureResearch(
  figure: Figure,
  sources: ResearchSource[],
  onProgress?: (p: ZipProgress) => void,
): Promise<void> {
  const name = `${safeFilename(figureName(figure))} — research.zip`
  if (figureZipIsCurrent(figure, sources) && figure.researchZip?.key) {
    await downloadKey(figure.researchZip.key, name)
    return
  }
  await downloadZip(name, figureZipItems(figure, sources), {
    onProgress,
    readme: (failed) => figureReadme(figure, sources, failed),
    readmePath: `${safeFilename(figureName(figure))} — research/README.md`,
  })
}

// ─── PDFs ─────────────────────────────────────────────────────────────────────

/** The source's typeset PDF, while its bundle still describes the source. */
export function sourcePdf(source: ResearchSource): ResearchPdf | null {
  const pdf = source.bundle?.pdf
  return sourceBundleIsCurrent(source) && pdf?.key ? pdf : null
}

/** The key of one file's PDF: a one-file source's is the source's own; a file of a
 *  longer source has its own, beside the source's (`…/sources/<slug>/files/0003.pdf`). */
export function filePdfKey(source: ResearchSource, fileIndex: number): string | null {
  const pdf = sourcePdf(source)
  if (!pdf || fileIndex < 0 || fileIndex >= source.files.length) return null
  if (source.files.length === 1) return pdf.format === 'zip' ? null : pdf.key
  if (source.bundle?.filePdfs !== source.files.length) return null
  return `${pdf.key.replace(/\.pdf(\.zip)?$/, '')}/files/${pad(fileIndex + 1, 4)}.pdf`
}

export function sourcePdfName(source: ResearchSource): string {
  const title = safeFilename(sourceTitle(source))
  return source.bundle?.pdf?.format === 'zip' ? `${title} (PDF).zip` : `${title}.pdf`
}

export function filePdfName(source: ResearchSource, fileIndex: number): string {
  return fileDownloadName(source, fileIndex).replace(/\.md$/, '.pdf')
}

export async function downloadSourcePdf(source: ResearchSource): Promise<void> {
  const pdf = sourcePdf(source)
  if (!pdf) throw new Error('no PDF for this source yet')
  await downloadKey(pdf.key, sourcePdfName(source))
}

export async function downloadFilePdf(source: ResearchSource, fileIndex: number): Promise<void> {
  const key = filePdfKey(source, fileIndex)
  if (!key) throw new Error('no PDF for this file yet')
  await downloadKey(key, filePdfName(source, fileIndex))
}

/** The subject's PDF, while it still describes the live source list. */
export function figurePdf(figure: Figure, sources: ResearchSource[]): ResearchPdf | null {
  const p = figure.researchPdf
  if (!p?.key) return null
  const listed = sources.reduce((n, s) => n + s.files.length, 0)
  return p.files === listed && (p.sources === undefined || p.sources === sources.length) ? p : null
}

export function figurePdfName(figure: Figure, pdf: ResearchPdf): string {
  const name = safeFilename(figureName(figure))
  return pdf.format === 'zip' ? `${name} — research (PDF).zip` : `${name} — research.pdf`
}

export async function downloadFigurePdf(figure: Figure, sources: ResearchSource[]): Promise<void> {
  const pdf = figurePdf(figure, sources)
  if (!pdf) throw new Error('no PDF for this subject yet')
  await downloadKey(pdf.key, figurePdfName(figure, pdf))
}

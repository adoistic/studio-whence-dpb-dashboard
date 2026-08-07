// Pure block builders for the two Word exports. A Block is a tiny, testable
// intermediate grammar; exportDocx.ts turns Blocks into docx-js objects.
// The literal labels (PAGE N / COMMENTS / SCRIPT / "No comments.") are the
// parse contract promised in the spec — change them nowhere else.
import type { ExportComicModel, ExportPage, ExportThread } from '@/lib/exportModel'
import { CATEGORY_LABELS, STATUS_COLOR, type Category, type Status } from '@/lib/feedbackTypes'
import type { ImageRef } from '@/lib/exportZip'

export type Run = { text: string; bold?: boolean; italics?: boolean }
export type Block =
  | { kind: 'title'; text: string; sub: string }
  | { kind: 'h1'; text: string; pageBreak?: boolean }
  | { kind: 'h2'; text: string }
  | { kind: 'image'; ref: ImageRef }
  | { kind: 'line'; runs: Run[]; indent?: boolean }
  | { kind: 'row'; left: Block[]; right: Block[] }

function statusLabel(s: string): string {
  return STATUS_COLOR[s as Status]?.label ?? s
}
function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c as Category] ?? c
}
function day(createdAt: string | null): string {
  return createdAt ? ` — ${createdAt.slice(0, 10)}` : ''
}

export function threadBlocks(t: ExportThread): Block[] {
  const blocks: Block[] = [
    { kind: 'line', runs: [{ text: `[${statusLabel(t.status)} · ${categoryLabel(t.category)}] `, bold: true }, { text: `${t.author} (${t.role})${day(t.createdAt)}` }] },
    { kind: 'line', runs: [{ text: t.body }] },
  ]
  const notes: string[] = []
  if (t.anchor && t.anchor.kind !== 'page') notes.push(`re: ${t.anchor.label} — “${t.anchor.snapshot}”`)
  if (t.alsoOnPages.length > 0) notes.push(`also on page ${t.alsoOnPages.join(', ')}`)
  if (notes.length > 0) blocks.push({ kind: 'line', runs: [{ text: `(${notes.join(' · ')})`, italics: true }] })
  for (const r of t.replies) {
    blocks.push({ kind: 'line', indent: true, runs: [{ text: `↳ ${r.author} (${r.role}): `, bold: true }, { text: r.body }] })
  }
  return blocks
}

function scriptBlocks(p: ExportPage): Block[] {
  const blocks: Block[] = []
  for (const panel of p.script?.panels ?? []) {
    blocks.push({ kind: 'line', runs: [{ text: `Panel ${panel.number}`, bold: true }] })
    if (panel.art) blocks.push({ kind: 'line', runs: [{ text: 'Art: ', bold: true }, { text: panel.art, italics: true }] })
    for (const b of panel.beats) {
      if (b.kind === 'caption') blocks.push({ kind: 'line', runs: [{ text: `${b.speaker}: `, bold: true }, { text: b.text }] })
      else if (b.kind === 'dialogue') blocks.push({ kind: 'line', runs: [{ text: `${b.name}: `, bold: true }, { text: b.text }] })
      else blocks.push({ kind: 'line', runs: [{ text: 'SFX: ', bold: true }, { text: b.text, italics: true }] })
    }
  }
  return blocks
}

/** The COMMENTS / SCRIPT sections for one page (no heading, no image). */
export function pageContentBlocks(p: ExportPage, model: ExportComicModel): Block[] {
  const blocks: Block[] = []
  if (model.options.includeComments) {
    blocks.push({ kind: 'h2', text: 'COMMENTS' })
    if (p.comments.length === 0) blocks.push({ kind: 'line', runs: [{ text: 'No comments.', italics: true }] })
    for (const t of p.comments) blocks.push(...threadBlocks(t))
  }
  if (model.options.includeScript && p.script) {
    blocks.push({ kind: 'h2', text: 'SCRIPT' })
    blocks.push(...scriptBlocks(p))
  }
  return blocks
}

function pageHeading(p: ExportPage): string {
  return p.image ? `PAGE ${p.page}` : `PAGE ${p.page} (no image published)`
}

function titleBlock(model: ExportComicModel): Block {
  return { kind: 'title', text: model.comic.title, sub: `${model.comic.line} / ${model.comic.slug} — exported ${new Date().toISOString().slice(0, 10)}` }
}

function generalBlocks(model: ExportComicModel): Block[] {
  if (!model.options.includeComments || model.generalComments.length === 0) return []
  const blocks: Block[] = [{ kind: 'h1', text: 'GENERAL COMMENTS', pageBreak: true }]
  for (const t of model.generalComments) blocks.push(...threadBlocks(t))
  return blocks
}

export function authorDocBlocks(model: ExportComicModel): Block[] {
  const blocks: Block[] = [titleBlock(model)]
  if (model.cover) blocks.push({ kind: 'h1', text: 'COVER' }, { kind: 'image', ref: 'cover' })
  model.pages.forEach((p, i) => {
    blocks.push({ kind: 'h1', text: pageHeading(p), pageBreak: i > 0 || model.cover !== null })
    if (p.image) blocks.push({ kind: 'image', ref: p.page })
    blocks.push(...pageContentBlocks(p, model))
  })
  blocks.push(...generalBlocks(model))
  return blocks
}

export function sideBySideDocBlocks(model: ExportComicModel): Block[] {
  const blocks: Block[] = [titleBlock(model)]
  if (model.cover) blocks.push({ kind: 'row', left: [{ kind: 'image', ref: 'cover' }], right: [{ kind: 'h2', text: 'COVER' }] })
  for (const p of model.pages) {
    blocks.push({
      kind: 'row',
      left: p.image ? [{ kind: 'image', ref: p.page }] : [{ kind: 'line', runs: [{ text: '[no image published]', italics: true }] }],
      right: [{ kind: 'h2', text: pageHeading(p) }, ...pageContentBlocks(p, model)],
    })
  }
  blocks.push(...generalBlocks(model))
  return blocks
}

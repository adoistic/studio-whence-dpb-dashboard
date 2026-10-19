/**
 * indesignTrims.ts — an InDesign edition set again at a print trim (6.25 × 9 in).
 *
 * The content repo's `tools/indesign_from_portal.py --trim` builds, beside each edition, the same
 * document at the trim Diamond lays comics out at: the deck's page scaled once and centred (the
 * art is never stretched or cropped) and checked glyph by glyph against the deck's PDF set the
 * same way. It records it inside the edition's own block, `indesign.trims["450x648"]`, so it is
 * offered only while it was built from the same deck as the edition beside it.
 */

import type { InDesignTrim } from '@/types/content'

export type { InDesignTrim }

export interface TrimmedBlock {
  key?: string
  deckKey?: string
  deckBytes?: number
  decks?: { key: string; bytes: number }[]
  trims?: Record<string, InDesignTrim>
}

const sameDecks = (a?: { key: string; bytes: number }[], b?: { key: string; bytes: number }[]) =>
  !!a && !!b && a.length === b.length && a.every((d, i) => d.key === b[i].key && d.bytes === b[i].bytes)

/** The trims of an InDesign block that were built from the deck(s) the block itself was, smallest
 *  page first. A trim left over from an earlier deck is not offered. */
export function currentTrims(block?: TrimmedBlock | null): InDesignTrim[] {
  if (!block?.key || !block.trims) return []
  return Object.values(block.trims)
    .filter((t) => !!t?.key && (block.decks
      ? sameDecks(t.decks, block.decks)
      : t.deckKey === block.deckKey && t.deckBytes === block.deckBytes))
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
}

export function trimLabel(t: InDesignTrim): string {
  return t.label || (t.width && t.height ? `${t.width} × ${t.height} in` : 'print trim')
}

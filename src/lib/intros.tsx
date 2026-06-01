import type { ComponentType } from 'react'
import Biographies from '@content/intros/biographies.mdx'
import Awareness from '@content/intros/awareness.mdx'
import Indic from '@content/intros/indic.mdx'
import Toddlers from '@content/intros/toddlers.mdx'

// Per-line editorial lead copy, hand-authored MDX, keyed by line slug.
// A new line adds one .mdx file + one entry here; a line with no entry renders no intro.
export const INTROS: Record<string, ComponentType> = {
  biographies: Biographies,
  awareness: Awareness,
  indic: Indic,
  toddlers: Toddlers,
}

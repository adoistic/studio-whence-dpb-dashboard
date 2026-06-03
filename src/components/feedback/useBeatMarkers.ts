'use client'
// Back-compat shim. The marker/affordance hook is now `useCommentTargets`
// (it covers page/panel/beat select-mode commenting); `indexBeats` survives as
// a thin alias of `indexUnits` for the scroll-spy and existing callers.
export { useCommentTargets } from '@/components/feedback/useCommentTargets'
export { indexUnits, anchorFromUnit, parseAnchorRef } from '@/components/feedback/anchorRef'

import { indexUnits } from '@/components/feedback/anchorRef'

/** @deprecated use indexUnits — kept so existing ref-by-key lookups keep working. */
export function indexBeats(el: HTMLElement): Map<string, HTMLElement> {
  return indexUnits(el)
}

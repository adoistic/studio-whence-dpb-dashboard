/**
 * healPages.ts — scheduled self-healer for comic reader `pages` blocks.
 *
 * The dashboard reader + PDF gate on each comic doc's `pages` block
 * (`comic.pages.hasPages`; `comicPageKeys` derives page keys from `count`).
 * That block is normally written by the source-repo publish pipeline, but the
 * pipeline derives it from page art on disk — and the art isn't in the CI
 * checkout, so a regression there can silently ship comics WITHOUT `pages` and
 * blank the reader (this happened 2026-07-06). The pipeline is now fixed to
 * re-attach `pages` from R2, and THIS function is the cloud-side backstop: it
 * runs on a schedule, reads the page art that actually exists in R2, and
 * restores/corrects the `pages` block on any NON-LEGACY comic that drifted.
 *
 * Legacy comics are intentionally skipped — their `pages` come from the
 * source repo's `legacy/_comics.yaml` registry (they survive art deletion and
 * are done), and this function never touches them.
 *
 * Safety: only ever writes the `pages` field, never other fields; never deletes
 * a doc; never removes an existing `pages` (a comic with no R2 art is left
 * exactly as-is, so a transient R2 list hiccup can't blank a reader). It is
 * idempotent — when Firestore already matches R2 it writes nothing.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { listKeysUnderPrefix } from './r2'

if (getApps().length === 0) initializeApp()

/** The R2 page image key shape: images/comics/{line}/{slug}/pages/page-NN.jpg */
const PAGE_RE = /^images\/comics\/([^/]+)\/([^/]+)\/pages\/page-(\d+)\.jpg$/
/** The R2 cover key shape: images/comics/{line}/{slug}/cover.jpg */
const COVER_RE = /^images\/comics\/([^/]+)\/([^/]+)\/cover\.jpg$/

const R2_COMICS_PREFIX = 'images/comics/'
const LEGACY_LINE = 'legacy'

/** The reader `pages` block shape stored on each comic doc. */
export interface PagesBlock {
  hasPages: true
  count: number
  coverKey: string | null
}

/**
 * Pure: fold a flat list of R2 keys into the desired `pages` block per comic,
 * keyed by `{line}__{slug}` (matching the Firestore comic doc id).
 *
 * A comic is included only when it has at least one page image AND those page
 * indices are contiguous 1..N — a gap would make `comicPageKeys` request a
 * missing `page-NN.jpg` (404), so such a set is skipped (and logged) rather
 * than emitting a block the reader can't fully resolve. `count` is the highest
 * page index; `coverKey` is set only when `cover.jpg` exists.
 */
export function computePagesFromR2(keys: string[]): Map<string, PagesBlock> {
  const pageIdx = new Map<string, Set<number>>()
  const covers = new Set<string>()

  for (const key of keys) {
    const pm = PAGE_RE.exec(key)
    if (pm) {
      const id = `${pm[1]}__${pm[2]}`
      const set = pageIdx.get(id) ?? new Set<number>()
      set.add(Number(pm[3]))
      pageIdx.set(id, set)
      continue
    }
    const cm = COVER_RE.exec(key)
    if (cm) covers.add(`${cm[1]}__${cm[2]}`)
  }

  const out = new Map<string, PagesBlock>()
  for (const [id, idx] of pageIdx) {
    const count = Math.max(...idx)
    let contiguous = idx.size === count
    for (let n = 1; contiguous && n <= count; n++) contiguous = idx.has(n)
    if (!contiguous) {
      console.warn(`healComicPages: R2 pages for ${id} are non-contiguous (count of ${idx.size}, max ${count}); skipping`)
      continue
    }
    const [line, slug] = id.split('__')
    out.set(id, {
      hasPages: true,
      count,
      coverKey: covers.has(id) ? `${R2_COMICS_PREFIX}${line}/${slug}/cover.jpg` : null,
    })
  }
  return out
}

/**
 * Pure: decide the write for one comic. Returns the `PagesBlock` to write, or
 * `null` for "leave the doc alone".
 *
 *  - legacy comic            → null (registry-owned; never touched)
 *  - no page art in R2        → null (never blank a reader on a list hiccup)
 *  - stored block == desired  → null (idempotent no-op)
 *  - otherwise                → the desired block (missing / drifted count or cover)
 */
export function reconcile(
  current: unknown,
  desired: PagesBlock | undefined,
  isLegacy: boolean,
): PagesBlock | null {
  if (isLegacy) return null
  if (!desired) return null
  const c = current as Partial<PagesBlock> | undefined | null
  if (c && c.hasPages === true && c.count === desired.count && (c.coverKey ?? null) === desired.coverKey) {
    return null
  }
  return desired
}

/**
 * Scheduled backstop: reconcile every non-legacy comic's `pages` block against
 * the page art present in R2. Hourly. Declares the same R2 secrets as `dataApi`.
 */
export const healComicPages = onSchedule(
  {
    schedule: 'every 60 minutes',
    region: 'us-central1',
    secrets: ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'],
  },
  async () => {
    const keys = await listKeysUnderPrefix(R2_COMICS_PREFIX)
    const desired = computePagesFromR2(keys)

    const db = getFirestore()
    const snap = await db.collection('comics').get()

    const healed: string[] = []
    let batch = db.batch()
    let ops = 0
    for (const doc of snap.docs) {
      const data = doc.data() as { line?: unknown; pages?: unknown }
      const isLegacy = data.line === LEGACY_LINE
      const block = reconcile(data.pages, desired.get(doc.id), isLegacy)
      if (!block) continue
      batch.update(doc.ref, { pages: block })
      healed.push(doc.id)
      ops++
      if (ops >= 400) {
        await batch.commit()
        batch = db.batch()
        ops = 0
      }
    }
    if (ops > 0) await batch.commit()

    console.log(
      healed.length > 0
        ? `healComicPages: healed ${healed.length} comic(s): ${healed.join(', ')}`
        : `healComicPages: no drift — ${snap.size} comics, ${desired.size} with R2 art, 0 writes`
    )
  }
)

// ⚠️ The dashboard repo is PUBLIC. No data-bearing assets (images, drafts,
// research) may be committed here. Production art is served gated, at runtime,
// via the Cloudflare Worker + R2 channel after a Firebase-auth check.
//
// These lists are intentionally EMPTY while the gated image channel is being
// built — the UI degrades to typographic plates and hides image-only sections.
// When the gated channel lands, these become runtime fetches, not bundled paths.

export function imgUrl(rel: string): string {
  return `/data/images/${rel.replace(/^\/+/, '')}`
}

export type SampleImage = { rel: string; caption: string }
export const SAMPLE_PAGES: SampleImage[] = []

export const HERO_BACKDROP = ''

export type LineVisual = {
  image?: string
  /** A short editorial descriptor shown under the line title. */
  note: string
}

export const LINE_VISUALS: Record<string, LineVisual> = {
  biographies: { note: 'Retold by Little Chanakya' },
  awareness: { note: 'Eight subjects, kid- and teen-facing' },
  indic: { note: 'The epics and the sacred texts' },
  toddlers: { note: 'Diamond Junior · Tingaland' },
}

export type NamedImage = { rel: string; name: string }
export const TINGALAND_CAST: NamedImage[] = []
export const TINGALAND_SETTINGS: NamedImage[] = []

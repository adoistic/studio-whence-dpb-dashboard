// ⚠️ The dashboard repo is PUBLIC. No data-bearing assets (images, drafts,
// research) may be committed here. Production art is served gated, at runtime,
// via the Cloudflare Worker + R2 channel after a Firebase-auth check.
//
// The lists below hold R2 KEYS (each `rel` is an `images/...` key), NOT bundled
// paths. They are resolved to short-lived presigned URLs at render time via the
// `useResolved` hook — the image bytes never ship in this public repo.

export function imgUrl(rel: string): string {
  return `/data/images/${rel.replace(/^\/+/, '')}`
}

export type SampleImage = { rel: string; caption: string }
export const SAMPLE_PAGES: SampleImage[] = [
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-twinkle.jpg', caption: 'Twinkle Twinkle' },
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-old-macdonald.jpg', caption: 'Old MacDonald' },
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-five-little-ducks.jpg', caption: 'Five Little Ducks' },
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-pat-a-cake.jpg', caption: 'Pat-a-Cake' },
]

export const HERO_BACKDROP = 'images/toddlers/tingaland/settings/tingaland-landscape-night-pixar-3d-background.jpg'

export type LineVisual = {
  image?: string
  /** A short editorial descriptor shown under the line title. */
  note: string
}

export const LINE_VISUALS: Record<string, LineVisual> = {
  biographies: { image: 'images/characters/little-chanakya/little-chanakya-turnaround.jpg', note: 'Retold by Little Chanakya' },
  awareness: { note: 'Eight subjects, kid- and teen-facing' },
  indic: { note: 'The epics and the sacred texts' },
  toddlers: { image: 'images/toddlers/tingaland/settings/tingaland-landscape-day-pixar-3d-background.jpg', note: 'Diamond Junior · Tingaland' },
}

export type NamedImage = { rel: string; name: string }
export const TINGALAND_CAST: NamedImage[] = [
  { rel: 'images/toddlers/tingaland/characters/tinga-dojo/tinga-dojo-turnaround.jpg', name: 'Tinga Dojo' },
  { rel: 'images/toddlers/tingaland/characters/boxy/boxy-turnaround.jpg', name: 'Boxy' },
  { rel: 'images/toddlers/tingaland/characters/keke/keke-turnaround.jpg', name: 'Keke' },
  { rel: 'images/toddlers/tingaland/characters/mira/variant-pixar-3d-turnaround.jpg', name: 'Mira' },
  { rel: 'images/toddlers/tingaland/characters/zara/variant-pixar-3d-turnaround.jpg', name: 'Zara' },
  { rel: 'images/toddlers/tingaland/characters/bingo/variant-pixar-3d-turnaround.jpg', name: 'Bingo' },
  { rel: 'images/toddlers/tingaland/characters/moon-cow/variant-pixar-3d-turnaround.jpg', name: 'Moon Cow' },
  { rel: 'images/toddlers/tingaland/characters/space-duck/variant-pixar-3d-turnaround.jpg', name: 'Space Duck' },
]

export const TINGALAND_SETTINGS: NamedImage[] = [
  { rel: 'images/toddlers/tingaland/settings/tingaland-landscape-day-pixar-3d-background.jpg', name: 'Tingaland, day' },
  { rel: 'images/toddlers/tingaland/settings/tingaland-landscape-night-pixar-3d-background.jpg', name: 'Tingaland, night' },
  { rel: 'images/toddlers/tingaland/settings/tingaland-village-pixar-3d-background.jpg', name: 'The village' },
  { rel: 'images/toddlers/tingaland/settings/tingaland-home-pixar-3d-background.jpg', name: 'Tinga’s home' },
  { rel: 'images/toddlers/tingaland/settings/tinga-ship-exterior-pixar-3d-background.jpg', name: 'The ship, outside' },
  { rel: 'images/toddlers/tingaland/settings/tinga-ship-interior-pixar-3d-background.jpg', name: 'The ship, inside' },
  { rel: 'images/toddlers/tingaland/settings/planet-bo-pixar-3d-background.jpg', name: 'Planet Bo' },
]

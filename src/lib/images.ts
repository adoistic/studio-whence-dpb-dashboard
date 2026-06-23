// ⚠️ The dashboard repo is PUBLIC. No data-bearing assets (images, drafts,
// research) may be committed here. Production art is served gated, at runtime,
// via the Cloudflare Worker + R2 channel after a Firebase-auth check.
//
// The lists below hold R2 KEYS (each `rel` is an `images/...` key), NOT bundled
// paths. They are resolved to short-lived presigned URLs at render time via the
// `useResolved` hook — the image bytes never ship in this public repo.

// The locked house style for Tingaland is `digital-art` (Diamond-approved
// 2026-06-10). The earlier multi-style exploration is retired; these are the
// digital-art sample pages. R2 keys only (image bytes live in R2).
export type SampleImage = { rel: string; caption: string }
export const SAMPLE_PAGES: SampleImage[] = [
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-digital-art-01.jpg', caption: 'Title' },
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-digital-art-02.jpg', caption: 'Dedication' },
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-digital-art-03.jpg', caption: 'Twinkle Twinkle' },
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-digital-art-04.jpg', caption: 'Mary Had a Little Lamb' },
]

export const HERO_BACKDROP = 'images/toddlers/tingaland/settings/tingaland-landscape-night-digital-art-background.jpg'

export type LineVisual = {
  image?: string
  /** A short editorial descriptor shown under the line title. */
  note: string
}

export const LINE_VISUALS: Record<string, LineVisual> = {
  biographies: { image: 'images/characters/little-chanakya/little-chanakya-turnaround.jpg', note: 'Retold by Little Chanakya' },
  awareness: { note: 'Eight subjects, kid- and teen-facing' },
  indic: { note: 'The epics and the sacred texts' },
  toddlers: { image: 'images/comics/toddlers/numbers/cover.jpg', note: 'Diamond Books · early-learning workbooks' },
  tingaland: { image: 'images/toddlers/tingaland/settings/tingaland-landscape-night-digital-art-background.jpg', note: 'Diamond Junior · Tinga Dojo & friends' },
}

export type NamedImage = { rel: string; name: string }
export const TINGALAND_CAST: NamedImage[] = [
  { rel: 'images/toddlers/tingaland/characters/tinga-dojo/variant-digital-art-turnaround-no-helmet.jpg', name: 'Tinga Dojo' },
  { rel: 'images/toddlers/tingaland/characters/boxy/variant-digital-art-turnaround.jpg', name: 'Boxy' },
  { rel: 'images/toddlers/tingaland/characters/keke/variant-digital-art-turnaround.jpg', name: 'Keke' },
  { rel: 'images/toddlers/tingaland/characters/mira/variant-digital-art-turnaround.jpg', name: 'Mira' },
  { rel: 'images/toddlers/tingaland/characters/mama/variant-digital-art-turnaround.jpg', name: 'Mama' },
  { rel: 'images/toddlers/tingaland/characters/papa/variant-digital-art-turnaround.jpg', name: 'Papa' },
  { rel: 'images/toddlers/tingaland/characters/zara/variant-digital-art-turnaround.jpg', name: 'Zara' },
  { rel: 'images/toddlers/tingaland/characters/bingo/variant-digital-art-turnaround.jpg', name: 'Bingo' },
  { rel: 'images/toddlers/tingaland/characters/moon-cow/variant-digital-art-turnaround.jpg', name: 'Moon Cow' },
  { rel: 'images/toddlers/tingaland/characters/space-duck/variant-digital-art-turnaround.jpg', name: 'Space Duck' },
]

export const TINGALAND_SETTINGS: NamedImage[] = [
  { rel: 'images/toddlers/tingaland/settings/tingaland-landscape-day-digital-art-background.jpg', name: 'Tingaland, day' },
  { rel: 'images/toddlers/tingaland/settings/tingaland-landscape-night-digital-art-background.jpg', name: 'Tingaland, night' },
  { rel: 'images/toddlers/tingaland/settings/tingaland-village-digital-art-background.jpg', name: 'The village' },
  { rel: 'images/toddlers/tingaland/settings/tingaland-home-digital-art-background.jpg', name: 'Tinga’s home' },
  { rel: 'images/toddlers/tingaland/settings/tinga-ship-exterior-digital-art-background.jpg', name: 'The ship, outside' },
  { rel: 'images/toddlers/tingaland/settings/tinga-ship-interior-digital-art-background.jpg', name: 'The ship, inside' },
  { rel: 'images/toddlers/tingaland/settings/planet-bo-digital-art-background.jpg', name: 'Planet Bo' },
]

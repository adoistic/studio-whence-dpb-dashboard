// Image payload lives under public/data/images and is served at /data/images/<rel>.
export function imgUrl(rel: string): string {
  return `/data/images/${rel.replace(/^\/+/, '')}`
}

// The four finished Tingaland sample pages — our strongest "this is what we make"
// proof. Portrait comic pages.
export const SAMPLE_PAGES: { rel: string; caption: string }[] = [
  { rel: 'samples/01-tingaland-rhymes/sample-page-twinkle.jpg', caption: 'Twinkle Twinkle' },
  { rel: 'samples/01-tingaland-rhymes/sample-page-old-macdonald.jpg', caption: 'Old MacDonald' },
  { rel: 'samples/01-tingaland-rhymes/sample-page-five-little-ducks.jpg', caption: 'Five Little Ducks' },
  { rel: 'samples/01-tingaland-rhymes/sample-page-pat-a-cake.jpg', caption: 'Pat-a-Cake' },
]

// A faint, atmospheric backdrop for the home hero.
export const HERO_BACKDROP = 'toddlers/tingaland/settings/tingaland-landscape-night-pixar-3d-background.jpg'

// Per-line visual identity. `image` is an optional banner; lines without
// produced art fall back to a typographic monogram plate.
export type LineVisual = {
  image?: string
  /** A short editorial descriptor shown under the line title on its card. */
  note: string
}

export const LINE_VISUALS: Record<string, LineVisual> = {
  biographies: {
    image: 'characters/little-chanakya/little-chanakya-turnaround.jpg',
    note: 'Retold by Little Chanakya',
  },
  awareness: {
    note: 'Eight subjects, kid- and teen-facing',
  },
  indic: {
    note: 'The epics and the sacred texts',
  },
  toddlers: {
    image: 'toddlers/tingaland/settings/tingaland-landscape-day-pixar-3d-background.jpg',
    note: 'Diamond Junior · Tingaland',
  },
}

// The Tingaland cast — turnaround sheets for the character gallery on /toddlers.
export const TINGALAND_CAST: { rel: string; name: string }[] = [
  { rel: 'toddlers/tingaland/characters/tinga-dojo/tinga-dojo-turnaround.jpg', name: 'Tinga Dojo' },
  { rel: 'toddlers/tingaland/characters/boxy/boxy-turnaround.jpg', name: 'Boxy' },
  { rel: 'toddlers/tingaland/characters/keke/keke-turnaround.jpg', name: 'Keke' },
  { rel: 'toddlers/tingaland/characters/mira/variant-pixar-3d-turnaround.jpg', name: 'Mira' },
  { rel: 'toddlers/tingaland/characters/zara/variant-pixar-3d-turnaround.jpg', name: 'Zara' },
  { rel: 'toddlers/tingaland/characters/bingo/variant-pixar-3d-turnaround.jpg', name: 'Bingo' },
  { rel: 'toddlers/tingaland/characters/moon-cow/variant-pixar-3d-turnaround.jpg', name: 'Moon Cow' },
  { rel: 'toddlers/tingaland/characters/space-duck/variant-pixar-3d-turnaround.jpg', name: 'Space Duck' },
]

export const TINGALAND_SETTINGS: { rel: string; name: string }[] = [
  { rel: 'toddlers/tingaland/settings/tingaland-landscape-day-pixar-3d-background.jpg', name: 'Tingaland, day' },
  { rel: 'toddlers/tingaland/settings/tingaland-landscape-night-pixar-3d-background.jpg', name: 'Tingaland, night' },
  { rel: 'toddlers/tingaland/settings/tingaland-village-pixar-3d-background.jpg', name: 'The village' },
  { rel: 'toddlers/tingaland/settings/tingaland-home-pixar-3d-background.jpg', name: 'Tinga’s home' },
  { rel: 'toddlers/tingaland/settings/tinga-ship-exterior-pixar-3d-background.jpg', name: 'The ship, outside' },
  { rel: 'toddlers/tingaland/settings/tinga-ship-interior-pixar-3d-background.jpg', name: 'The ship, inside' },
  { rel: 'toddlers/tingaland/settings/planet-bo-pixar-3d-background.jpg', name: 'Planet Bo' },
]

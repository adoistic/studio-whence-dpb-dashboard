// ⚠️ The dashboard repo is PUBLIC. No data-bearing assets (images, drafts,
// research) may be committed here. Production art is served gated, at runtime,
// via the Cloudflare Worker + R2 channel after a Firebase-auth check.
//
// The lists below hold R2 KEYS (each `rel` is an `images/...` key), NOT bundled
// paths. They are resolved to short-lived presigned URLs at render time via the
// `useResolved` hook — the image bytes never ship in this public repo.

export type SampleImage = { rel: string; caption: string }
export const SAMPLE_PAGES: SampleImage[] = [
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-twinkle.jpg', caption: 'Twinkle Twinkle' },
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-old-macdonald.jpg', caption: 'Old MacDonald' },
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-five-little-ducks.jpg', caption: 'Five Little Ducks' },
  { rel: 'images/samples/01-tingaland-rhymes/sample-page-pat-a-cake.jpg', caption: 'Pat-a-Cake' },
]

// First four pages rendered in three alternate style directions — a style-pick
// comparison shown alongside the headline Pixar 3D. R2 keys only (bytes in R2).
export type StyleSet = { style: string; note: string; pages: SampleImage[] }
export const STYLE_EXPLORATION: StyleSet[] = [
  {
    style: '2D flat',
    note: 'Bold flat-colour cartoon',
    pages: [
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-2d-flat-01.jpg', caption: 'Title' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-2d-flat-02.jpg', caption: 'Dedication' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-2d-flat-03.jpg', caption: 'Twinkle Twinkle' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-2d-flat-04.jpg', caption: 'Mary Had a Little Lamb' },
    ],
  },
  {
    style: 'Coloured pencil',
    note: 'Warm hand-drawn pencil',
    pages: [
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-colored-pencil-01.jpg', caption: 'Title' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-colored-pencil-02.jpg', caption: 'Dedication' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-colored-pencil-03.jpg', caption: 'Twinkle Twinkle' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-colored-pencil-04.jpg', caption: 'Mary Had a Little Lamb' },
    ],
  },
  {
    style: 'Watercolour',
    note: 'Lush premium watercolour',
    pages: [
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-watercolor-01.jpg', caption: 'Title' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-watercolor-02.jpg', caption: 'Dedication' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-watercolor-03.jpg', caption: 'Twinkle Twinkle' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-watercolor-04.jpg', caption: 'Mary Had a Little Lamb' },
    ],
  },
  {
    style: 'Digital art',
    note: 'Polished 2D digital illustration',
    pages: [
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-digital-art-01.jpg', caption: 'Title' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-digital-art-02.jpg', caption: 'Dedication' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-digital-art-03.jpg', caption: 'Twinkle Twinkle' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-digital-art-04.jpg', caption: 'Mary Had a Little Lamb' },
    ],
  },
  {
    style: 'Gouache',
    note: 'Opaque matte gouache',
    pages: [
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-gouache-01.jpg', caption: 'Title' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-gouache-02.jpg', caption: 'Dedication' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-gouache-03.jpg', caption: 'Twinkle Twinkle' },
      { rel: 'images/samples/01-tingaland-rhymes/sample-page-gouache-04.jpg', caption: 'Mary Had a Little Lamb' },
    ],
  },
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

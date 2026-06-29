// Types derived from the real shape of content.json produced by
// tools/build_dashboard_data.py in the DPB comic-production repo.

export type Status = 'draft' | 'in-review' | 'approved' | 'published' | 'placeholder'

// A line slug is data (the publisher emits the line set), not a compile-time constant.
export type LineSlug = string

// changelog is heterogeneous: biography comics use objects, toddlers comics
// use plain strings (already-formatted "YYYY-MM-DD — note" entries).
export type ChangelogEntry = string | { date: string; note: string }

export interface Comic {
  title: string
  subject?: string
  line: LineSlug
  series?: string
  comic_number?: number
  status: Status
  logline?: string
  time_span?: string
  target_length_pages?: number
  target_age?: string
  narrator?: string
  created?: string
  updated?: string
  changelog?: ChangelogEntry[]
  version?: number
  sources_count?: number
  slug: string
  subject_slug: string | null
  // Program tier (Line → Program → Subject): which program this comic belongs to.
  program_slug?: string | null
  // Toddlers-specific optional fields
  subtitle?: string
  ip?: string
  imprint?: string
  format?: string
  max_text_lines_per_page?: number
  art_style?: string
  language?: string
  // Future-proofing (not yet in data)
  sample_image?: string
  artifacts?: Record<string, string>
  // Client-facing docs (concept-note, sources-and-quotes, script, …) for this
  // comic, published by the Firestore catalog pipeline (not content.json).
  docs?: {
    generatedAt: string
    items: { type: string; label: string; readKey: string; downloadKey: string; bytes: number }[]
    bundleKey: string; bundleBytes: number; zipKey: string; zipBytes: number
  }
  // Rendered comic art (cover + page count) published to images/comics/…;
  // present only when the comic has art. Drives the reader + PDF download.
  pages?: {
    hasPages: boolean
    count: number
    coverKey: string | null
  }
  // Editable PowerPoint (.pptx) copy, published to a gated comic-scoped
  // artifacts/comics/… key. Present only for books that ship an editable export
  // (the Diamond Activity Books). Drives the "Download as PPT (editable)" button.
  editablePpt?: {
    key: string
    bytes: number
    filename: string
  }
  // Print-ready CMYK PDF copy (separated to PSO Uncoated v3 / FOGRA52), published
  // to a gated comic-scoped artifacts/comics/… key. Present only for books that
  // ship a CMYK export. Drives the "Download CMYK (print)" button.
  cmykPdf?: {
    key: string
    bytes: number
    filename: string
  }
  // Amazon A+ marketing modules (banner, image-header, "a peek inside", "why this
  // story"), published to gated comic-scoped artifacts/comics/…/amazon-modules/…
  // keys. Present only for comics that ship A+ modules. Drives the "A+ Modules"
  // sub-tab on the comic page; images are resolved to presigned URLs like pages.
  amazonModules?: {
    images: { key: string; label: string; bytes: number; filename: string }[]
  }
  // Translated editions. Each entry is one target language: the translated SCRIPT
  // (read-gated docs/comics/… markdown), an optional translated EDITABLE .pptx, and
  // an optional BLANK-version PDF (clean, text-free pages — used when the source art
  // is Devanagari and cannot be made into an editable translated deck). Drives the
  // per-comic "language section" on the comic page.
  translations?: {
    language: string
    script?: { key: string; bytes: number }
    editablePpt?: { key: string; bytes: number; filename: string }
    blank?: { key: string; bytes: number; filename: string }
  }[]
}

export interface ResearchFile {
  path: string
  title: string
}

export interface ResearchSource {
  slug: string
  // book / transcript (biographies) · topic-note (cite-driven) · the Subject
  // sub-parts (Indic characters + future original IP).
  kind: 'book' | 'transcript' | 'topic-note' | 'character-dossier' | 'design-bible' | 'characterization'
  title: string
  words: number
  files: ResearchFile[]
}

export interface Figure {
  series: string
  slug: string
  line?: string
  // Program tier: which program (series / epic / category) this subject belongs to.
  program_slug?: string | null
  // medicomics: each disease is an open-research figure any allowlisted member
  // may read (no specific allocation required).
  openResearch?: boolean
  sources_count: number
  words: number
  sources?: ResearchSource[]
  // Subject sub-parts (Program tier, line-agnostic): the per-character production
  // artifacts — dossier, design bible, characterization, and the design-variations
  // gallery (locked turnarounds). R2 object keys, served gated. Populated for any
  // Subject that has them (Indic characters today, original IP characters later).
  dossierKey?: string
  designKey?: string
  characterizationKey?: string
  variations?: { label: string; stage?: string; key: string; bytes?: number }[]
  // Cross-work links: the same being appearing in other programs.
  alsoIn?: { program: string; line: string; slug: string }[]
}

export interface Program {
  slug: string
  line: LineSlug
  title: string
  blurb?: string
  order?: number
  status?: string
  emblem?: string
}

export interface Line {
  slug: LineSlug
  title: string
  subtitle: string
  programs?: Program[]
  program_count?: number
  comics: Comic[]
  figures: Figure[]
}

export interface ActivityEntry {
  sha: string
  date: string
  title: string
}

export interface Headline {
  figures_researched: number
  comics_in_production: number
  lines_active: number
}

// ── Coverage (meta/coverage) ────────────────────────────────────────────────
// A studio-status roll-up written by the content publish pipeline alongside
// meta/catalog, readable by any allowlisted member. It is the source for the
// home-page coverage overview: per-line figures-researched + a program/series
// breakdown + a comic-production pipeline by status. The shape mirrors
// build_dashboard_data.py exactly; lines[] arrives pre-sorted (figures desc,
// then comics desc) and each line's programs[] pre-sorted (figures desc).

export interface CoverageTotals {
  lines: number
  figures: number
  comics: number
  published: number
  approved: number
  in_review: number
  draft: number
}

export interface CoverageProgram {
  slug: string
  title: string
  figures: number
  comics: number
}

// The comic-production pipeline for a line, counted by status.
export interface CoveragePipeline {
  total: number
  draft: number
  in_review: number
  approved: number
  published: number
}

export interface CoverageLine {
  slug: LineSlug
  title: string
  subtitle: string
  figures: number
  programs: CoverageProgram[]
  comics: CoveragePipeline
}

export interface Coverage {
  generated_at: string
  source_sha: string
  totals: CoverageTotals
  lines: CoverageLine[]
}

export interface Content {
  generated_at: string
  source_sha: string
  headline: Headline
  lines: Line[]
  activity: ActivityEntry[]
  images?: string[]
}

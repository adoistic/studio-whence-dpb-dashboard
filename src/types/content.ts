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
}

export interface ResearchFile {
  path: string
  title: string
}

export interface ResearchSource {
  slug: string
  kind: 'book' | 'transcript'
  title: string
  words: number
  files: ResearchFile[]
}

export interface Figure {
  series: string
  slug: string
  sources_count: number
  words: number
  sources?: ResearchSource[]
}

export interface Line {
  slug: LineSlug
  title: string
  subtitle: string
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

export interface Content {
  generated_at: string
  source_sha: string
  headline: Headline
  lines: Line[]
  activity: ActivityEntry[]
  images?: string[]
}

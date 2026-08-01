import { normalizeSubjectSlug } from '@/lib/slugs'
import type { Comic, Figure } from '@/types/content'

// ─── Program membership ─────────────────────────────────────────────────────────
//
// One being can belong to more than one program: Krishna's design and his own
// comic live in the Mahābhārata, and Cosmic Beings carries a separate,
// text-faithful dossier of him as Śiva's devotee. `program_slug` stays a SINGLE
// value because it is the key the Firestore allocation rules match on;
// `also_programs` is the display-only list of the other programs.
//
// Cross-listing is FIRST CLASS in the UI: a cross-listed being appears in the
// program's Characters tab AND their comics appear in its Comics tab, rendered
// exactly like a native one. Anything less makes the being look absent from a
// program that genuinely holds them — which is what these helpers fix.
//
// Both take an ALREADY-GATED figure/comic list (the useVisible* hooks), so a
// figure the viewer cannot read is simply not in the input. Cross-listing can
// therefore never widen access.

/** The figures a program shows: its own, plus every being cross-listed into it. */
export function programFigures(figures: Figure[], lineSlug: string, programSlug: string): Figure[] {
  return figures.filter(
    (f) =>
      f.line === lineSlug &&
      (f.program_slug === programSlug || (f.also_programs ?? []).includes(programSlug)),
  )
}

/**
 * The comics a program shows: its own, plus the comics of the beings cross-listed
 * into it. `figures` is the whole gated figure list — the cross-listed members are
 * resolved here so callers cannot forget the second half of the rule.
 */
export function programComics(
  comics: Comic[],
  figures: Figure[],
  lineSlug: string,
  programSlug: string,
): Comic[] {
  const memberSlugs = new Set(programFigures(figures, lineSlug, programSlug).map((f) => f.slug))
  return comics.filter(
    (c) =>
      c.line === lineSlug &&
      (c.program_slug === programSlug || memberSlugs.has(normalizeSubjectSlug(c.subject_slug))),
  )
}

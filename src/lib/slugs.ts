/**
 * Normalize a subject_slug for routing/matching. The publisher derives
 * subject_slug from a directory name, which is lowercase for biographies but
 * title-cased for some Indic folders ("Gita"); lower-casing makes the figure
 * link/match consistent. (Indic has no figures, so the fix is forward-looking.)
 */
export function normalizeSubjectSlug(slug: string | null | undefined): string {
  return (slug ?? '').toLowerCase()
}

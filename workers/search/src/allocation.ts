/**
 * allocation.ts — the work-allocation gate, ported from the Cloud Function's
 * functions/src/allocation.ts and from firestore.rules.
 *
 * The index carries each page-document's line / subject / program, so deciding
 * access needs NO Firestore lookup per result — only the caller's own three
 * self-readable documents, read once per request.
 *
 * COMIC access tests RAW `figures` (never `figures_effective`): a single comic
 * grant must not cascade to that figure's sibling comics. This mirrors
 * `comicAllowed` in firestore.rules exactly; if one changes, change both.
 *
 * Fails CLOSED: no allocation, an unreadable doc, or an empty grant set all deny.
 */
import type { Caller } from './auth'

export interface Allocation {
  lines: string[]
  figures: string[]
  comics: string[]
  programs: string[]
}

export interface ScopedDoc {
  comicId: string
  line: string
  subject_slug: string
  program_slug: string
}

export function comicAllowed(
  doc: ScopedDoc, caller: Caller, alloc: Allocation | null,
): boolean {
  if (caller.moderator) return true
  if (!alloc) return false
  return (
    alloc.comics.includes(doc.comicId) ||
    alloc.lines.includes(doc.line) ||
    (!!doc.subject_slug && alloc.figures.includes(doc.subject_slug)) ||
    (!!doc.program_slug && alloc.programs.includes(doc.program_slug))
  )
}

// ── Firestore REST, called AS THE USER ────────────────────────────────────────

const FS = 'https://firestore.googleapis.com/v1/projects'

/**
 * Read one document as the caller. `null` means absent OR denied — the two are
 * deliberately indistinguishable here, because both must fail closed.
 */
async function readDoc(
  path: string, token: string, projectId: string,
): Promise<Record<string, unknown> | null> {
  let res: Response
  try {
    res = await fetch(`${FS}/${projectId}/databases/(default)/documents/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const body = (await res.json()) as { fields?: Record<string, unknown> }
  return body.fields ?? {}
}

/** Firestore REST wraps values; pull a string array back out of one. */
function stringArray(field: unknown): string[] {
  const values = (field as { arrayValue?: { values?: { stringValue?: string }[] } })
    ?.arrayValue?.values
  if (!Array.isArray(values)) return []
  return values.map((v) => v.stringValue ?? '').filter(Boolean)
}

function stringField(field: unknown): string {
  return (field as { stringValue?: string })?.stringValue ?? ''
}

/** Mirrors firestore.rules isDomainAllowed(). */
const ALLOWED_DOMAINS = ['@thothica.com', '@dpb.in']

/**
 * Resolve the caller: allowlisted? moderator? what are they allocated?
 *
 * Mirrors firestore.rules' isAllowlisted / isSubAdmin exactly:
 *   allowlisted = !suspended && (isAdmin || domain-allowed || has an allowlist doc)
 *   moderator   = isAdmin || (allowlisted && allowlist doc role == 'sub_admin')
 *
 * Returns null for anyone not allowlisted — the caller then 403s.
 */
export async function readCaller(
  token: string, email: string, projectId: string, adminEmail: string,
): Promise<{ caller: Caller; alloc: Allocation | null } | null> {
  const [suspended, allow, allocDoc] = await Promise.all([
    readDoc(`suspended/${encodeURIComponent(email)}`, token, projectId),
    readDoc(`allowlist/${encodeURIComponent(email)}`, token, projectId),
    readDoc(`allocations/${encodeURIComponent(email)}`, token, projectId),
  ])

  // A suspended account is not allowlisted, whatever else it holds.
  if (suspended !== null) return null

  const isAdmin = email === adminEmail.trim().toLowerCase()
  const domainAllowed = ALLOWED_DOMAINS.some((d) => email.endsWith(d))
  const hasAllowDoc = allow !== null
  if (!isAdmin && !domainAllowed && !hasAllowDoc) return null

  const moderator = isAdmin || (hasAllowDoc && stringField(allow?.role) === 'sub_admin')

  const alloc: Allocation | null = allocDoc
    ? {
        lines: stringArray(allocDoc.lines),
        figures: stringArray(allocDoc.figures),
        comics: stringArray(allocDoc.comics),
        programs: stringArray(allocDoc.programs),
      }
    : null

  return { caller: { email, moderator }, alloc }
}

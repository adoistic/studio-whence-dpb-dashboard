/**
 * aiConversationAccess.ts — pure access helpers for the AI-conversation route.
 *
 * Mirrors `ideaAccess.ts`: path-confinement + a visibility predicate, both pure
 * (no I/O), so the gated `/ai-conversation` route's logic is unit-testable.
 *
 * Visibility is the LOCKED decision from the medicomics-dashboard plan:
 *   - moderator (sub-admin/admin) → always.
 *   - line-attached conversation  → any allowlisted member (line-level is open).
 *   - comic-attached conversation → only a member allocated that comic.
 *   - figure-attached conversation → any allowlisted member when `open:true`
 *       (the medicomics disease model), else a member holding that line.
 *   - any other attach kind        → denied.
 * Fails closed on null auth.
 */

/** The return shape of `authorize()` (or `null` when not allowlisted). */
export interface AiConvAuth {
  email: string;
  moderator: boolean;
  admin: boolean;
}

/** A conversation's attachment — what work it hangs off of. */
export interface AiConvAttachTo {
  kind: "comic" | "line" | "figure" | "idea";
  line: string;
  comicSlug?: string;
  figureSlug?: string;
  open?: boolean;
}

export interface AiConversation {
  attachTo: AiConvAttachTo;
}

/** A member's comic/line allocation grants (subset of `Allocation` we need). */
export interface AiConvAllocation {
  comics: string[];
  lines: string[];
}

/** Path-confinement: a conversation's stored r2Key must be its own transcript. */
export function aiConvR2KeyIsConfined(convId: string, r2Key: string): boolean {
  if (r2Key.includes("..")) return false;
  return r2Key === `ai-conversations/${convId}.md`;
}

/**
 * Decide whether `auth` may read AI conversation `conv`.
 *
 * @param auth  The return of `authorize()` — `{ email, moderator, admin }` or `null`.
 * @param conv  The conversation doc (its `attachTo` is what gates visibility).
 * @param alloc The member's comic/line grants (only consulted for comic-attached
 *              conversations; moderators and line-attached convs bypass it).
 */
export function canReadAiConversation(
  auth: AiConvAuth | null,
  conv: AiConversation,
  alloc: AiConvAllocation = { comics: [], lines: [] }
): boolean {
  if (auth == null) return false;
  if (auth.moderator) return true;

  const attachTo = conv.attachTo;
  if (!attachTo || typeof attachTo !== "object") return false;

  // Line-level conversations are open to any allowlisted member.
  if (attachTo.kind === "line") return true;

  // Comic-level conversations require allocation of that specific comic.
  if (attachTo.kind === "comic") {
    const { line, comicSlug } = attachTo;
    if (!line || !comicSlug) return false;
    const comicId = `${line}__${comicSlug}`;
    // Minimal allocation membership check (the async Firestore-bound helper in
    // allocation.ts keys on R2 paths, not a bare comic id, so it isn't cleanly
    // reusable here): allow if the member is allocated this comic id OR has the
    // whole line.
    // TODO (P2-4): also honour the figure/subject-grant nuance — an explicit
    // figure grant (or a subject-of-granted-comic) should unlock a comic-attached
    // conversation. The medicomics use-case is line-attached, so the line branch
    // is what must be correct now; wire the comic-doc subject lookup later.
    if (alloc.comics.includes(comicId)) return true;
    if (alloc.lines.includes(line)) return true;
    return false;
  }

  // Figure-attached conversations: open to any allowlisted member when the
  // attachment is flagged `open:true` (the medicomics disease model); otherwise
  // the member must hold the conversation's line. (auth==null and moderator are
  // handled at the top.)
  if (attachTo.kind === "figure") {
    if (attachTo.open === true) return true;
    const { line } = attachTo;
    if (line && alloc.lines.includes(line)) return true;
    // (A figure-level grant via attachTo.figureSlug could also unlock this; the
    // line grant is sufficient for the current medicomics use-case.)
    return false;
  }

  // idea / anything else → denied.
  return false;
}

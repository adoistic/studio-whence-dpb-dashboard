/**
 * ideaAccess.ts — pure idea-visibility predicate for the /idea-capture route.
 *
 * MUST mirror the `ideas/{id}` read rule in firestore.rules exactly:
 *   admin ∨ author ∨ (all_sub_admins ∧ sub-admin) ∨ all_approved ∨ recipient.
 * `moderator` ≡ the rules' isSubAdmin(); `authorize` already implies
 * isAllowlisted(). Fails closed on malformed docs.
 */

export interface Caller {
  email: string;
  moderator: boolean;
  admin: boolean;
}

export function canReadIdea(
  caller: Caller,
  idea: Record<string, unknown>
): boolean {
  if (caller.admin) return true;
  const author = typeof idea.author === "string" ? idea.author : null;
  if (author !== null && author === caller.email) return true;
  const vis = idea.visibility;
  if (vis === "all_sub_admins") return caller.moderator;
  if (vis === "all_approved") return true;
  if (vis === "specific") {
    // Deliberately NARROWER than the Firestore rule: the rule's recipients
    // branch is unconditional (a list-query concession; recipients are only
    // ever non-empty on 'specific' ideas), while this predicate gates it under
    // visibility === 'specific' — fail-closed direction, intentional.
    const recipients = Array.isArray(idea.recipients) ? idea.recipients : [];
    return recipients.includes(caller.email);
  }
  return false; // 'private' or malformed
}

/** Path-confinement: a capture's stored r2Key must live under its own idea. */
export function captureR2KeyIsConfined(ideaId: string, r2Key: string): boolean {
  if (r2Key.includes("..")) return false;
  return r2Key.startsWith(`idea-captures/${ideaId}/`);
}

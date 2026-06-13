/**
 * keys.ts — key normalization + prefix allowlist (the path-safety boundary).
 *
 * This is the security boundary for the gated data backbone. Every R2 object
 * key that comes from a request body/param MUST pass through `safeKey` before
 * it is handed to the presigner (`/resolve`) or fetched (`/read`).
 *
 * Design intent (defense in depth):
 *   - The prefix allowlist is the PRIMARY safeguard. Even a double-encoded
 *     traversal that survives the single URL-decode is rejected because the
 *     resulting key won't begin with an allowed prefix.
 *   - `content.json` (the bucket root manifest) is NOT an allowed prefix, so it
 *     can never be presigned through `/resolve`; it is served only by `/content`
 *     via a hard-coded GetObject. (A presigned `content.json` URL would be
 *     downloadable unauthenticated for the TTL window — never allow that.)
 *   - `secrets/` and the bucket root are likewise not allowed prefixes.
 */

/** Prefixes presignable through `/resolve`. `content.json` is deliberately absent. */
export const RESOLVE_PREFIXES = [
  'research/',
  'drafts/',
  'images/',
  'artifacts/',
  'docs/',
] as const;

/** Prefixes readable through `/read` (proxied text). Narrower than resolve.
 * `ai-conversations/` serves transcript bytes inline like the other `/read`
 * prefixes — it is deliberately NOT in RESOLVE_PREFIXES (never presigned). */
export const READ_PREFIXES = [
  'research/',
  'drafts/',
  'docs/',
  'ai-conversations/',
  'sites/',
] as const;

/** Prefixes writable through the presigned-PUT /upload-url route. Idea images only. */
export const WRITE_PREFIXES = ['images/ideas/'] as const;

/**
 * Normalize and validate an R2 object key against an allowlist of prefixes.
 *
 * @param raw     The candidate key from the request (may be percent-encoded).
 * @param allowed The set of permitted key prefixes (e.g. RESOLVE_PREFIXES).
 * @returns       The decoded key if safe, otherwise `null`.
 */
export function safeKey(
  raw: string,
  allowed: readonly string[]
): string | null {
  // 1. URL-decode once. Malformed percent-encoding throws — never crash.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  // 2. Reject traversal / absolute / Windows-style keys.
  if (decoded.includes('..')) return null;
  if (decoded.startsWith('/')) return null;
  if (decoded.includes('\\')) return null;

  // 3. Require an allowed prefix (the primary safeguard).
  if (!allowed.some((prefix) => decoded.startsWith(prefix))) return null;

  // 4. Safe — return the decoded key.
  return decoded;
}

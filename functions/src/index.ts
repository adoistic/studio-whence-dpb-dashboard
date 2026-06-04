import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";

import { authorize } from "./auth";
import { safeKey, RESOLVE_PREFIXES, READ_PREFIXES } from "./keys";
import { getObject, presignGet } from "./r2";
import {
  getAllocation,
  isKeyAllowedForMember,
  type Allocation,
} from "./allocation";

/**
 * dataApi — the gatekeeper Cloud Function for the gated data backbone.
 *
 * Three gated routes, all behind `authorize` (Firebase ID-token + allowlist):
 *   GET  /content      → the bucket-root `content.json` manifest, served INLINE
 *                        from a HARD-CODED key. Never goes through safeKey/presign
 *                        (a presigned content.json would be fetchable unauth'd for
 *                        the TTL window — see keys.ts).
 *   POST /resolve      → body `{ keys: string[] }`; each key is validated via
 *                        `safeKey(k, RESOLVE_PREFIXES)`, invalid keys are dropped,
 *                        survivors are presigned. Returns `{ urls: { key: url } }`.
 *   GET  /read?key=    → `safeKey(key, READ_PREFIXES)`; the object bytes are served
 *                        INLINE (proxied text), not presigned.
 *
 * CORS is applied FIRST on every response (success, 4xx, 5xx, and the OPTIONS
 * preflight) so the browser can read the response. Auth failure → 403; unknown
 * route → 404; R2 read error → 404 (missing object) or 500.
 */

/** The default browser origins allowed to call this API (overridable via env). */
const DEFAULT_CORS_ORIGINS = [
  "https://studio-whence-dpb.web.app",
  "https://dpb.studiowhence.com",
  "http://localhost:5509",
];

/** Parse the allow-listed origins from `CORS_ORIGINS` env (comma-separated). */
function allowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) return DEFAULT_CORS_ORIGINS;
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

/**
 * Apply CORS headers to the response. Echoes the request Origin only when it is
 * allow-listed (never `*`, because requests carry an Authorization header). Sets
 * `Vary: Origin` so caches don't serve one origin's response to another. Called
 * on EVERY response path, including errors and the OPTIONS preflight.
 */
function applyCors(req: Request, res: Response): void {
  const origin = req.get("origin");
  res.set("Vary", "Origin");
  if (origin && allowedOrigins().includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
}

/** Reduce a request path to its trailing route segment.
 *
 * Robust to both the hosting-rewrite shape (`/content`) and the emulator shape
 * (`/dataApi/content`); trailing slashes are stripped.
 */
function routeOf(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() ?? "";
}

export const dataApi = onRequest(
  { secrets: ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] },
  async (req: Request, res: Response) => {
  // CORS FIRST, always — so even 403/404/500 and the preflight carry the header.
  applyCors(req, res);

  // ── OPTIONS preflight ──────────────────────────────────────────────────────
  // No auth on the preflight. The ACAO header (if any) was set by applyCors;
  // a disallowed origin simply gets a 204 with no ACAO and the browser blocks.
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Max-Age", "3600");
    res.status(204).send("");
    return;
  }

  const route = routeOf(req.path);

  // ── GET /content ─────────────────────────────────────────────────────────
  if (req.method === "GET" && route === "content") {
    const auth = await authorize(req);
    if (!auth) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      // HARD-CODED key — never through safeKey/presign (see module doc).
      const { body, contentType } = await getObject("content.json");
      res.status(200).type(contentType ?? "application/json").send(body);
    } catch {
      res.status(500).json({ error: "content unavailable" });
    }
    return;
  }

  // ── POST /resolve ──────────────────────────────────────────────────────────
  if (req.method === "POST" && route === "resolve") {
    const auth = await authorize(req);
    if (!auth) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    // Firebase parses a JSON body when Content-Type is application/json; be
    // tolerant of a raw string body or a missing body.
    let parsed: unknown = req.body;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = undefined;
      }
    }
    const keys = (parsed as { keys?: unknown } | undefined)?.keys;
    if (!Array.isArray(keys)) {
      res.status(400).json({ error: "keys must be an array" });
      return;
    }
    if (keys.length > 50) {
      res.status(400).json({ error: "too many keys" });
      return;
    }

    // Validate + drop invalid keys (don't fail the whole batch for one bad key).
    let validKeys = keys
      .map((k) => safeKey(String(k), RESOLVE_PREFIXES))
      .filter((k): k is string => k !== null);

    // Allocation gate: moderators (admin + sub-admins) see everything; a member
    // is restricted to allocated works. Read the allocation doc ONCE, then drop
    // any key whose work the member isn't allocated (same "drop, don't fail the
    // batch" approach used for invalid keys above). Fails closed on error.
    if (!auth.moderator) {
      let alloc: Allocation | null;
      try {
        alloc = await getAllocation(auth.email);
      } catch {
        res.status(500).json({ error: "resolve failed" });
        return;
      }
      const allowed = await Promise.all(
        validKeys.map(async (k) => {
          try {
            return await isKeyAllowedForMember(k, alloc);
          } catch {
            return false; // fail closed on a per-key lookup error
          }
        })
      );
      validKeys = validKeys.filter((_, i) => allowed[i]);
    }

    try {
      const entries = await Promise.all(
        validKeys.map(async (k) => [k, await presignGet(k)] as const)
      );
      const urls: Record<string, string> = {};
      for (const [k, url] of entries) urls[k] = url;
      res.status(200).json({ urls });
    } catch {
      res.status(500).json({ error: "resolve failed" });
    }
    return;
  }

  // ── GET /read?key= ───────────────────────────────────────────────────────
  if (req.method === "GET" && route === "read") {
    const auth = await authorize(req);
    if (!auth) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const key = safeKey(String(req.query.key ?? ""), READ_PREFIXES);
    if (key === null) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    // Allocation gate: moderators read any valid key; a member may read only a
    // key for an allocated work — otherwise 403. Fails closed on error.
    if (!auth.moderator) {
      let permitted = false;
      try {
        const alloc = await getAllocation(auth.email);
        permitted = await isKeyAllowedForMember(key, alloc);
      } catch {
        permitted = false;
      }
      if (!permitted) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }
    try {
      const { body, contentType } = await getObject(key);
      res.status(200).type(contentType ?? "text/markdown").send(body);
    } catch (err) {
      // A missing object → 404; any other R2 error → 500.
      const name = (err as { name?: string } | null)?.name;
      if (name === "NoSuchKey" || name === "NotFound") {
        res.status(404).json({ error: "not found" });
      } else {
        res.status(500).json({ error: "read failed" });
      }
    }
    return;
  }

  // ── Unknown route ──────────────────────────────────────────────────────────
  res.status(404).json({ error: "not found" });
  }
);

import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";

import { authorize } from "./auth";
import {
  buildCoverRefKey,
  safeKey,
  RESOLVE_PREFIXES,
  READ_PREFIXES,
  WRITE_PREFIXES,
} from "./keys";
import { getObject, presignGet, presignPut } from "./r2";
import {
  getAllocation,
  isKeyAllowedForMember,
  type Allocation,
} from "./allocation";
import { canReadIdea, captureR2KeyIsConfined } from "./ideaAccess";
import { getIdeaData, getCaptureData } from "./ideaStore";
import {
  aiConvR2KeyIsConfined,
  canReadAiConversation,
  type AiConversation,
} from "./aiConversationAccess";
import { getAiConversationData } from "./aiConversationStore";
import { rewriteMedikidzHtml } from "./medikidzSite";

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
    // The full catalog manifest is moderator-only (admin + sub-admins). The
    // dashboard reads the Firestore catalog now, so /content is kept solely as a
    // moderator/rollback fallback; a plain member must NOT pull the whole catalog.
    if (!auth.moderator) {
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

  // ── POST /upload-url ───────────────────────────────────────────────────────
  if (req.method === "POST" && route === "upload-url") {
    const auth = await authorize(req);
    if (!auth) { res.status(403).json({ error: "forbidden" }); return; }
    if (!auth.moderator) { res.status(403).json({ error: "forbidden" }); return; }

    let parsed: unknown = req.body;
    if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { parsed = undefined; } }
    const b = parsed as {
      ideaId?: unknown;
      coverRef?: { line?: unknown; slug?: unknown };
      filename?: unknown;
      contentType?: unknown;
    } | undefined;
    const contentType = String(b?.contentType ?? "");
    if (!contentType.startsWith("image/")) {
      res.status(400).json({ error: "bad request" }); return;
    }
    const rawName = String(b?.filename ?? "");

    let key: string | null = null;
    if (b?.coverRef) {
      key = buildCoverRefKey(
        String(b.coverRef.line ?? ""),
        String(b.coverRef.slug ?? ""),
        rawName
      );
    } else {
      const ideaId = String(b?.ideaId ?? "");
      const filename = rawName.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._-]/g, "_") ?? "";
      if (!ideaId || !filename) {
        res.status(400).json({ error: "bad request" }); return;
      }
      key = safeKey(`images/ideas/${ideaId}/${filename}`, WRITE_PREFIXES);
    }
    if (key === null) { res.status(403).json({ error: "forbidden" }); return; }
    try {
      const url = await presignPut(key, contentType);
      res.status(200).json({ url, key });
    } catch {
      res.status(500).json({ error: "upload-url failed" });
    }
    return;
  }

  // ── GET /idea-capture?ideaId=&captureId= ───────────────────────────────────
  // Serves a captured ChatGPT-share transcript from R2, gated by IDEA
  // VISIBILITY (not work-allocation — idea data follows the idea's own ACL).
  if (req.method === "GET" && route === "idea-capture") {
    const auth = await authorize(req);
    if (!auth) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const ideaId = String(req.query.ideaId ?? "");
    const captureId = String(req.query.captureId ?? "").toLowerCase();
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(ideaId) ||
      !/^[0-9a-f-]{20,64}$/.test(captureId)
    ) {
      res.status(400).json({ error: "bad request" });
      return;
    }
    try {
      const idea = await getIdeaData(ideaId);
      if (!idea) {
        res.status(404).json({ error: "not found" });
        return;
      }
      if (!canReadIdea(auth, idea)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const capture = await getCaptureData(ideaId, captureId);
      const r2Key = capture?.r2Key;
      if (!capture || capture.status !== "captured" || typeof r2Key !== "string") {
        res.status(404).json({ error: "not found" });
        return;
      }
      if (!captureR2KeyIsConfined(ideaId, r2Key)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const { body } = await getObject(r2Key);
      res.status(200).type("text/markdown").send(body);
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "NoSuchKey" || name === "NotFound") {
        res.status(404).json({ error: "not found" });
      } else {
        res.status(500).json({ error: "idea-capture failed" });
      }
    }
    return;
  }

  // ── GET /ai-conversation?id= ───────────────────────────────────────────────
  // Serves a captured AI-conversation transcript (ChatGPT/Gemini/…) from R2,
  // gated by the LOCKED visibility decision: line-attached → any allowlisted
  // member; comic-attached → that comic's allocation; moderators → all.
  if (req.method === "GET" && route === "ai-conversation") {
    const auth = await authorize(req);
    if (!auth) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const id = String(req.query.id ?? "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      res.status(400).json({ error: "bad request" });
      return;
    }
    try {
      const conv = await getAiConversationData(id);
      if (!conv) {
        res.status(404).json({ error: "not found" });
        return;
      }
      if (conv.status !== "captured") {
        res.status(404).json({ error: "not found" });
        return;
      }
      // Comic-attached conversations need the member's allocation; moderators and
      // line-attached conversations short-circuit inside the predicate, so only
      // fetch the allocation doc for non-moderators (≤1 Firestore read).
      let alloc = { comics: [] as string[], lines: [] as string[] };
      if (!auth.moderator) {
        const a = await getAllocation(auth.email);
        if (a) alloc = { comics: a.comics, lines: a.lines };
      }
      if (!canReadAiConversation(auth, conv as unknown as AiConversation, alloc)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const r2Key = conv.r2Key;
      if (typeof r2Key !== "string" || !aiConvR2KeyIsConfined(id, r2Key)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const { body } = await getObject(r2Key);
      res.status(200).type("text/markdown").send(body);
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "NoSuchKey" || name === "NotFound") {
        res.status(404).json({ error: "not found" });
      } else {
        res.status(500).json({ error: "ai-conversation failed" });
      }
    }
    return;
  }

  // ── GET /medikidz-site ─────────────────────────────────────────────────────
  // Serves the gated Medikidz "Comic Analysis" embed: a single self-contained
  // page from R2 (`sites/medikidz/index.html`) with every bare image path
  // (`assets/covers|pages/…jpg`, ~195 of them, most JS-injected) rewritten to a
  // presigned R2 URL. Visibility: ANY allowlisted member (same tier as
  // methodology/research) — moderators always pass; members pass via the
  // sites/ scopeOfKey branch (no allocation needed).
  if (req.method === "GET" && route === "medikidz-site") {
    const auth = await authorize(req);
    if (!auth) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const SITE_KEY = "sites/medikidz/index.html";
    // Allocation gate: moderators read any valid key; a member must be allowed
    // the site key (any allowlisted member is, via the sites/ scope). Fail closed.
    if (!auth.moderator) {
      let permitted = false;
      try {
        const alloc = await getAllocation(auth.email);
        permitted = await isKeyAllowedForMember(SITE_KEY, alloc);
      } catch {
        permitted = false;
      }
      if (!permitted) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }
    try {
      const { body } = await getObject(SITE_KEY);
      const html = body.toString("utf-8");
      // Presign every unique asset key once, then rewrite synchronously.
      const cache = new Map<string, string>();
      const uniqueKeys = new Set<string>();
      rewriteMedikidzHtml(html, (key) => {
        uniqueKeys.add(key);
        return key;
      });
      await Promise.all(
        [...uniqueKeys].map(async (key) => {
          cache.set(key, await presignGet(key));
        })
      );
      const rewritten = rewriteMedikidzHtml(html, (key) => cache.get(key) ?? key);
      res.status(200).type("text/html").send(rewritten);
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "NoSuchKey" || name === "NotFound") {
        res.status(404).json({ error: "not found" });
      } else {
        res.status(500).json({ error: "medikidz-site failed" });
      }
    }
    return;
  }

  // ── Unknown route ──────────────────────────────────────────────────────────
  res.status(404).json({ error: "not found" });
  }
);

export { onIdeaWritten } from "./ideasTrigger";
export { healComicPages } from "./healPages";

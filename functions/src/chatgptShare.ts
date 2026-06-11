/**
 * chatgptShare.ts — PURE logic for ChatGPT share-link capture (no I/O).
 *
 * A public share page (https://chatgpt.com/share/<id>) embeds its conversation
 * as a turbo-stream payload inside
 * `window.__reactRouterContext.streamController.enqueue("...")` script calls.
 * The first enqueue chunk's first line is a flat JSON value array; objects are
 * encoded as `{"_<keyIdx>": <valIdx>}`, arrays as arrays of indices, special
 * values as negative indices, typed values as `["D", idx]`-style tagged arrays.
 * The share route's data sits at
 * `loaderData["routes/share.$shareId.($action)"].serverResponse.data` with
 * `title`, `create_time`, `default_model_slug` and `linear_conversation[]`.
 *
 * SECURITY: never fetch a raw user-supplied URL. Detection captures only the
 * shareId; the fetch URL is reconstructed via `fetchUrlFor` (host pinned to
 * chatgpt.com, id character class [0-9a-f-]).
 */

export interface ShareLink {
  url: string;
  shareId: string;
}

export interface ShareMessage {
  role: "user" | "assistant";
  text: string;
}

export interface ParsedShare {
  title: string;
  model: string | null;
  createTime: number | null; // epoch seconds (fractional)
  updateTime: number | null;
  messages: ShareMessage[];
}

// Upper bound matches the /idea-capture route's captureId regex — keep the
// two contracts aligned (real share ids are 36-char UUIDs).
const SHARE_LINK_RE =
  /https?:\/\/(?:chatgpt\.com|chat\.openai\.com)\/share\/([0-9a-fA-F-]{20,64})/g;

/** Extract share links from idea markdown — deduped by shareId, document order. */
export function extractShareLinks(markdown: string): ShareLink[] {
  const seen = new Set<string>();
  const out: ShareLink[] = [];
  for (const m of markdown.matchAll(SHARE_LINK_RE)) {
    const shareId = m[1].toLowerCase();
    if (seen.has(shareId)) continue;
    seen.add(shareId);
    out.push({ url: m[0], shareId });
  }
  return out;
}

/** The fetch URL for a shareId — always chatgpt.com (chat.openai.com redirects). */
export function fetchUrlFor(shareId: string): string {
  return `https://chatgpt.com/share/${shareId}`;
}

// A complete JS double-quoted string literal, escape-aware: a conversation may
// legitimately contain the characters `");` — JSON-escaped as `\");` — so a
// lazy `".*?"` would close the group early and corrupt the payload.
const ENQUEUE_RE =
  /streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/;

/** Hydrate one index of the flat turbo-stream value array. */
function hydrate(
  values: unknown[],
  i: number,
  memo: Map<number, unknown>
): unknown {
  if (i < 0) return undefined; // negative indices encode undefined/NaN/±Inf
  if (memo.has(i)) return memo.get(i);
  const v = values[i];
  if (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  ) {
    memo.set(i, v);
    return v;
  }
  if (Array.isArray(v)) {
    if (v.length > 0 && typeof v[0] === "string") {
      // Tagged value (Date / Promise / …). Only dates carry data we keep.
      if (v[0] === "D" && typeof v[1] === "number") return values[v[1]];
      return undefined;
    }
    const out: unknown[] = [];
    memo.set(i, out);
    for (const x of v) {
      out.push(typeof x === "number" ? hydrate(values, x, memo) : undefined);
    }
    return out;
  }
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    memo.set(i, out);
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (!k.startsWith("_")) continue;
      const key = values[Number(k.slice(1))];
      if (typeof key !== "string") continue;
      out[key] = typeof val === "number" ? hydrate(values, val, memo) : undefined;
    }
    return out;
  }
  return undefined;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : {};
}

/** Parse a share page's HTML into a ParsedShare. Throws Error('parse: …') on failure. */
export function parseShareHtml(html: string): ParsedShare {
  const m = ENQUEUE_RE.exec(html);
  if (!m) throw new Error("parse: no turbo-stream payload");
  let values: unknown[];
  try {
    const payload = JSON.parse(m[1]) as string; // JS string literal → string
    values = JSON.parse(payload.split("\n")[0]) as unknown[];
  } catch {
    throw new Error("parse: malformed turbo-stream payload");
  }
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("parse: malformed turbo-stream payload");
  }
  const root = asRecord(hydrate(values, 0, new Map()));
  const data = asRecord(
    asRecord(
      asRecord(asRecord(root.loaderData)["routes/share.$shareId.($action)"])
        .serverResponse
    ).data
  );
  const linear = data.linear_conversation;
  if (!Array.isArray(linear)) {
    throw new Error("parse: no linear_conversation");
  }
  const messages: ShareMessage[] = [];
  for (const node of linear) {
    const msg = asRecord(asRecord(node).message);
    const role = asRecord(msg.author).role;
    if (role !== "user" && role !== "assistant") continue;
    const content = asRecord(msg.content);
    const ct = content.content_type;
    if (ct !== "text" && ct !== "multimodal_text") continue;
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const text = parts
      .filter((p): p is string => typeof p === "string")
      .join("\n\n")
      .trim();
    if (text) messages.push({ role, text });
  }
  return {
    title: typeof data.title === "string" ? data.title : "Untitled conversation",
    model:
      typeof data.default_model_slug === "string"
        ? data.default_model_slug
        : null,
    createTime: typeof data.create_time === "number" ? data.create_time : null,
    updateTime: typeof data.update_time === "number" ? data.update_time : null,
    messages,
  };
}

/** Render the transcript markdown stored in R2 and shown in the dashboard. */
export function transcriptMarkdown(
  parsed: ParsedShare,
  url: string,
  capturedAtIso: string
): string {
  const lines: string[] = [
    `# ${parsed.title}`,
    "",
    `- Source: ${url}`,
    `- Captured: ${capturedAtIso}`,
    `- Model: ${parsed.model ?? "unknown"}`,
    `- Conversation created: ${
      parsed.createTime !== null
        ? new Date(parsed.createTime * 1000).toISOString()
        : "unknown"
    }`,
    `- Messages: ${parsed.messages.length}`,
    "",
    "---",
  ];
  for (const msg of parsed.messages) {
    lines.push("", msg.role === "user" ? "## User" : "## ChatGPT", "", msg.text);
  }
  lines.push("");
  return lines.join("\n");
}

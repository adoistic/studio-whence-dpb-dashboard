/**
 * ideasTrigger.ts — Firestore trigger: capture ChatGPT share links on idea writes.
 *
 * Detection always runs (capture docs appear within seconds of a post); the
 * fetch is BEST EFFORT — GCP egress may be blocked by Cloudflare, in which case
 * captures land `failed`/`pending` and the content-repo sweeper
 * (tools/ingest_chatgpt_shares.py) completes them from Adnan's machine.
 *
 * No self-trigger loop: this function writes only to the captures SUBcollection,
 * never to ideas/{ideaId} itself.
 */
import { onDocumentWritten } from "firebase-functions/v2/firestore";

import {
  extractShareLinks,
  fetchUrlFor,
  parseShareHtml,
  transcriptMarkdown,
  type ShareLink,
} from "./chatgptShare";
import { deleteObject, putObject } from "./r2";
import {
  createCapture,
  deleteCaptureDoc,
  listCaptureIds,
  markCaptured,
  markFailed,
} from "./ideaStore";

const FETCH_TIMEOUT_MS = 20_000;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Fetch a share page's HTML (reconstructed URL — never the raw user string). */
export async function fetchShareHtml(shareId: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(fetchUrlFor(shareId), {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export interface TriggerDeps {
  createCapture: (
    ideaId: string, shareId: string, url: string, source: "function"
  ) => Promise<boolean>;
  markCaptured: (
    ideaId: string, shareId: string,
    fields: {
      title: string; model: string | null;
      messageCount: number; charCount: number;
      createTime: number | null; r2Key: string;
    }
  ) => Promise<void>;
  markFailed: (ideaId: string, shareId: string, error: string) => Promise<void>;
  fetchHtml: (shareId: string) => Promise<string>;
  putTranscript: (key: string, body: string) => Promise<void>;
  listCaptures: (ideaId: string) => Promise<string[]>;
  removeCapture: (ideaId: string, shareId: string) => Promise<void>;
  removeTranscript: (key: string) => Promise<void>;
  now: () => string; // ISO timestamp
}

const realDeps: TriggerDeps = {
  createCapture,
  markCaptured,
  markFailed,
  fetchHtml: fetchShareHtml,
  putTranscript: (key, body) =>
    putObject(key, body, "text/markdown; charset=utf-8"),
  listCaptures: listCaptureIds,
  removeCapture: deleteCaptureDoc,
  removeTranscript: deleteObject,
  now: () => new Date().toISOString(),
};

async function captureOne(
  ideaId: string,
  link: ShareLink,
  deps: TriggerDeps
): Promise<void> {
  try {
    const html = await deps.fetchHtml(link.shareId);
    const parsed = parseShareHtml(html);
    const md = transcriptMarkdown(parsed, link.url, deps.now());
    const r2Key = `idea-captures/${ideaId}/${link.shareId}.md`;
    await deps.putTranscript(r2Key, md);
    await deps.markCaptured(ideaId, link.shareId, {
      title: parsed.title,
      model: parsed.model,
      messageCount: parsed.messages.length,
      charCount: md.length,
      createTime: parsed.createTime,
      r2Key,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await deps.markFailed(ideaId, link.shareId, msg);
    } catch (e) {
      console.error(`capture markFailed failed for ${ideaId}/${link.shareId}`, e);
    }
  }
}

/** Core trigger logic — pure orchestration over injected deps (unit-tested). */
export async function processIdeaWrite(
  ideaId: string,
  after: Record<string, unknown> | null,
  deps: TriggerDeps = realDeps
): Promise<void> {
  if (after === null) {
    // Idea deleted: remove captures + transcripts. Per-capture failures are
    // logged but don't stop the rest of the cleanup.
    const ids = await deps.listCaptures(ideaId);
    for (const id of ids) {
      try {
        await deps.removeTranscript(`idea-captures/${ideaId}/${id}.md`);
      } catch (e) {
        console.error(`capture R2 cleanup failed for ${ideaId}/${id}`, e);
      }
      try {
        await deps.removeCapture(ideaId, id);
      } catch (e) {
        console.error(`capture doc cleanup failed for ${ideaId}/${id}`, e);
      }
    }
    return;
  }

  const body = typeof after.bodyMarkdown === "string" ? after.bodyMarkdown : "";
  const links = extractShareLinks(body);
  if (links.length === 0) return;

  // Only fetch shareIds whose create() succeeded in THIS run — admin status
  // edits re-fire the trigger and must not refetch existing captures.
  const fresh: ShareLink[] = [];
  for (const link of links) {
    if (await deps.createCapture(ideaId, link.shareId, link.url, "function")) {
      fresh.push(link);
    }
  }
  await Promise.allSettled(fresh.map((l) => captureOne(ideaId, l, deps)));
}

export const onIdeaWritten = onDocumentWritten(
  {
    document: "ideas/{ideaId}",
    timeoutSeconds: 300, // five links × worst-case fetch must never hit the 60s default
    secrets: ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"],
  },
  async (event) => {
    const ideaId = event.params.ideaId;
    const afterSnap = event.data?.after;
    const after =
      afterSnap && afterSnap.exists
        ? (afterSnap.data() as Record<string, unknown>)
        : null;
    await processIdeaWrite(ideaId, after);
  }
);

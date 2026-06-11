import { beforeEach, describe, expect, test, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────
//
// `processIdeaWrite` takes a fully-injected deps object, so the real I/O
// modules are never exercised here — these module mocks only make IMPORTING
// ideasTrigger side-effect-free (no Functions runtime, no firebase-admin,
// no AWS SDK).

vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentWritten: () => undefined,
}));
vi.mock("../r2", () => ({
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  presignGet: vi.fn(),
  presignPut: vi.fn(),
  getObject: vi.fn(),
}));
vi.mock("../ideaStore", () => ({
  createCapture: vi.fn(),
  markCaptured: vi.fn(),
  markFailed: vi.fn(),
  listCaptureIds: vi.fn(),
  deleteCaptureDoc: vi.fn(),
  getIdeaData: vi.fn(),
  getCaptureData: vi.fn(),
}));

import { parseShareHtml, transcriptMarkdown } from "../chatgptShare";
import { processIdeaWrite, type TriggerDeps } from "../ideasTrigger";

// ─── Synthetic turbo-stream fixture (NO real conversation data — public repo) ──
// Same shape as chatgptShare.test.ts's fixture (duplicated deliberately:
// test files never import from each other).
const VALUES: unknown[] = [
  { _1: 2 }, "loaderData", { _3: 4 }, "routes/share.$shareId.($action)",
  { _5: 6 }, "serverResponse", { _7: 8 }, "data",
  { _9: 10, _11: 12, _13: 14, _15: 16, _17: 18 },
  "title", "Test Conversation", "default_model_slug", "gpt-5-5",
  "create_time", 1700000000.5, "update_time", 1700000010.5,
  "linear_conversation", [19, 38, 45],
  { _20: 31 }, "message", null, "author", null, "role", null, "content", null,
  "content_type", null, "parts",
  { _22: 32, _26: 34 }, { _24: 33 }, "user",
  { _28: 35, _30: 36 }, "text", [37], "Hello from the user",
  { _20: 39 }, { _22: 40, _26: 42 }, { _24: 41 }, "assistant",
  { _28: 35, _30: 43 }, [44], "Hi! This is the assistant reply.",
  { _20: 46 }, { _22: 40, _26: 47 }, { _28: 48, _30: 49 }, "thoughts",
  [50], "secret reasoning",
];

function syntheticHtml(values: unknown[] = VALUES): string {
  const payload = JSON.stringify(values) + "\n";
  return (
    "<html><body><script>window.__reactRouterContext.streamController.enqueue(" +
    JSON.stringify(payload) +
    ");</script></body></html>"
  );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const IDEA_ID = "idea-test-1";
const SHARE_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SHARE_B = "11111111-2222-3333-4444-555555555555";
const URL_A = `https://chatgpt.com/share/${SHARE_A}`;
const URL_B = `https://chatgpt.com/share/${SHARE_B}`;
const NOW_ISO = "2026-06-11T12:00:00.000Z";

function makeDeps(): TriggerDeps & {
  createCapture: ReturnType<typeof vi.fn>;
  markCaptured: ReturnType<typeof vi.fn>;
  markFailed: ReturnType<typeof vi.fn>;
  fetchHtml: ReturnType<typeof vi.fn>;
  putTranscript: ReturnType<typeof vi.fn>;
  listCaptures: ReturnType<typeof vi.fn>;
  removeCapture: ReturnType<typeof vi.fn>;
  removeTranscript: ReturnType<typeof vi.fn>;
} {
  return {
    createCapture: vi.fn(async () => true),
    markCaptured: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    fetchHtml: vi.fn(async () => syntheticHtml()),
    putTranscript: vi.fn(async () => undefined),
    listCaptures: vi.fn(async () => []),
    removeCapture: vi.fn(async () => undefined),
    removeTranscript: vi.fn(async () => undefined),
    now: () => NOW_ISO,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─── processIdeaWrite — capture branch ───────────────────────────────────────

describe("processIdeaWrite — new/updated idea", () => {
  test("two share links → both created, fetched, stored, marked captured", async () => {
    const deps = makeDeps();
    const after = {
      bodyMarkdown: `First ${URL_A} then ${URL_B} done.`,
    };
    await processIdeaWrite(IDEA_ID, after, deps);

    expect(deps.createCapture).toHaveBeenCalledTimes(2);
    expect(deps.createCapture).toHaveBeenNthCalledWith(
      1, IDEA_ID, SHARE_A, URL_A, "function"
    );
    expect(deps.createCapture).toHaveBeenNthCalledWith(
      2, IDEA_ID, SHARE_B, URL_B, "function"
    );
    expect(deps.fetchHtml).toHaveBeenCalledTimes(2);
    expect(deps.fetchHtml).toHaveBeenCalledWith(SHARE_A);
    expect(deps.fetchHtml).toHaveBeenCalledWith(SHARE_B);

    // The transcript markdown is the real renderer's output over the fixture.
    const parsed = parseShareHtml(syntheticHtml());
    const mdA = transcriptMarkdown(parsed, URL_A, NOW_ISO);
    const mdB = transcriptMarkdown(parsed, URL_B, NOW_ISO);
    expect(deps.putTranscript).toHaveBeenCalledTimes(2);
    expect(deps.putTranscript).toHaveBeenCalledWith(
      `idea-captures/${IDEA_ID}/${SHARE_A}.md`, mdA
    );
    expect(deps.putTranscript).toHaveBeenCalledWith(
      `idea-captures/${IDEA_ID}/${SHARE_B}.md`, mdB
    );

    expect(deps.markCaptured).toHaveBeenCalledTimes(2);
    expect(deps.markCaptured).toHaveBeenCalledWith(IDEA_ID, SHARE_A, {
      title: "Test Conversation",
      model: "gpt-5-5",
      messageCount: 2,
      charCount: mdA.length,
      createTime: 1700000000.5,
      r2Key: `idea-captures/${IDEA_ID}/${SHARE_A}.md`,
    });
    expect(deps.markCaptured).toHaveBeenCalledWith(IDEA_ID, SHARE_B, {
      title: "Test Conversation",
      model: "gpt-5-5",
      messageCount: 2,
      charCount: mdB.length,
      createTime: 1700000000.5,
      r2Key: `idea-captures/${IDEA_ID}/${SHARE_B}.md`,
    });
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  test("existing capture (createCapture → false) is NOT refetched", async () => {
    const deps = makeDeps();
    deps.createCapture.mockImplementation(
      async (_ideaId: string, shareId: string) => shareId !== SHARE_A
    );
    const after = { bodyMarkdown: `${URL_A} and ${URL_B}` };
    await processIdeaWrite(IDEA_ID, after, deps);

    expect(deps.createCapture).toHaveBeenCalledTimes(2);
    expect(deps.fetchHtml).toHaveBeenCalledTimes(1);
    expect(deps.fetchHtml).toHaveBeenCalledWith(SHARE_B);
    expect(deps.markCaptured).toHaveBeenCalledTimes(1);
    expect(deps.markCaptured).toHaveBeenCalledWith(
      IDEA_ID, SHARE_B, expect.objectContaining({ title: "Test Conversation" })
    );
  });

  test("one fetch failing → that link markFailed, the other still captured", async () => {
    const deps = makeDeps();
    deps.fetchHtml.mockImplementation(async (shareId: string) => {
      if (shareId === SHARE_A) throw new Error("fetch 403");
      return syntheticHtml();
    });
    const after = { bodyMarkdown: `${URL_A} and ${URL_B}` };
    await processIdeaWrite(IDEA_ID, after, deps);

    expect(deps.markFailed).toHaveBeenCalledTimes(1);
    expect(deps.markFailed).toHaveBeenCalledWith(IDEA_ID, SHARE_A, "fetch 403");
    expect(deps.markCaptured).toHaveBeenCalledTimes(1);
    expect(deps.markCaptured).toHaveBeenCalledWith(
      IDEA_ID, SHARE_B, expect.objectContaining({ messageCount: 2 })
    );
    // The failed link never wrote a transcript.
    expect(deps.putTranscript).toHaveBeenCalledTimes(1);
  });

  test("junk HTML → markFailed with a parse error", async () => {
    const deps = makeDeps();
    deps.fetchHtml.mockResolvedValue("<html><body>junk</body></html>");
    const after = { bodyMarkdown: URL_A };
    await processIdeaWrite(IDEA_ID, after, deps);

    expect(deps.markCaptured).not.toHaveBeenCalled();
    expect(deps.putTranscript).not.toHaveBeenCalled();
    expect(deps.markFailed).toHaveBeenCalledTimes(1);
    expect(deps.markFailed).toHaveBeenCalledWith(
      IDEA_ID, SHARE_A, expect.stringMatching(/parse:/)
    );
  });

  test("idea with no share links → no capture calls at all", async () => {
    const deps = makeDeps();
    const after = { bodyMarkdown: "Just a plain idea, no links here." };
    await processIdeaWrite(IDEA_ID, after, deps);

    expect(deps.createCapture).not.toHaveBeenCalled();
    expect(deps.fetchHtml).not.toHaveBeenCalled();
    expect(deps.putTranscript).not.toHaveBeenCalled();
    expect(deps.markCaptured).not.toHaveBeenCalled();
    expect(deps.markFailed).not.toHaveBeenCalled();
  });
});

// ─── processIdeaWrite — delete branch ────────────────────────────────────────

describe("processIdeaWrite — idea deleted (after === null)", () => {
  test("removes every capture's transcript then its doc", async () => {
    const deps = makeDeps();
    deps.listCaptures.mockResolvedValue([SHARE_A, SHARE_B]);
    await processIdeaWrite(IDEA_ID, null, deps);

    expect(deps.listCaptures).toHaveBeenCalledWith(IDEA_ID);
    expect(deps.removeTranscript).toHaveBeenCalledTimes(2);
    expect(deps.removeTranscript).toHaveBeenCalledWith(
      `idea-captures/${IDEA_ID}/${SHARE_A}.md`
    );
    expect(deps.removeTranscript).toHaveBeenCalledWith(
      `idea-captures/${IDEA_ID}/${SHARE_B}.md`
    );
    expect(deps.removeCapture).toHaveBeenCalledTimes(2);
    expect(deps.removeCapture).toHaveBeenCalledWith(IDEA_ID, SHARE_A);
    expect(deps.removeCapture).toHaveBeenCalledWith(IDEA_ID, SHARE_B);
    // Deletion never touches the capture pipeline.
    expect(deps.createCapture).not.toHaveBeenCalled();
    expect(deps.fetchHtml).not.toHaveBeenCalled();
  });

  test("a removeTranscript rejection doesn't stop the rest of the cleanup", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const deps = makeDeps();
    deps.listCaptures.mockResolvedValue([SHARE_A, SHARE_B]);
    deps.removeTranscript.mockImplementation(async (key: string) => {
      if (key.includes(SHARE_A)) throw new Error("r2 down");
    });
    await processIdeaWrite(IDEA_ID, null, deps);

    // SHARE_A's doc removal still ran despite its transcript failure…
    expect(deps.removeCapture).toHaveBeenCalledWith(IDEA_ID, SHARE_A);
    // …and SHARE_B was fully cleaned.
    expect(deps.removeTranscript).toHaveBeenCalledWith(
      `idea-captures/${IDEA_ID}/${SHARE_B}.md`
    );
    expect(deps.removeCapture).toHaveBeenCalledWith(IDEA_ID, SHARE_B);
    expect(errSpy).toHaveBeenCalled();
  });
});

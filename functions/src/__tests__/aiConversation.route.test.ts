import { beforeEach, describe, expect, test, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────
//
// Same harness as ideaCapture.route.test.ts: `../auth`, `../r2`, `../allocation`
// mocked, `firebase-functions/v2/https` returns the bare handler. Additionally:
//   `../aiConversationStore` → getAiConversationData stubbed (no firebase-admin).
//   `../aiConversationAccess` → REAL (pure visibility predicate + key confinement).
//   `../ideaStore` → stubbed (index.ts + the re-exported trigger import it).
//   `firebase-functions/v2/firestore` → onDocumentWritten stubbed.

const {
  authorize,
  presignGet,
  presignPut,
  getObject,
  getAllocation,
  isKeyAllowedForMember,
  getIdeaData,
  getCaptureData,
  getAiConversationData,
} = vi.hoisted(() => ({
  authorize: vi.fn(),
  presignGet: vi.fn(),
  presignPut: vi.fn(),
  getObject: vi.fn(),
  getAllocation: vi.fn(),
  isKeyAllowedForMember: vi.fn(),
  getIdeaData: vi.fn(),
  getCaptureData: vi.fn(),
  getAiConversationData: vi.fn(),
}));

vi.mock("../auth", () => ({ authorize }));
vi.mock("../r2", () => ({
  presignGet,
  presignPut,
  getObject,
  putObject: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock("../allocation", () => ({ getAllocation, isKeyAllowedForMember }));
vi.mock("../ideaStore", () => ({
  getIdeaData,
  getCaptureData,
  createCapture: vi.fn(),
  markCaptured: vi.fn(),
  markFailed: vi.fn(),
  listCaptureIds: vi.fn(),
  deleteCaptureDoc: vi.fn(),
}));
vi.mock("../aiConversationStore", () => ({ getAiConversationData }));
vi.mock("firebase-functions/v2/https", () => ({
  onRequest: (arg1: unknown, arg2?: unknown) =>
    typeof arg1 === "function" ? arg1 : arg2,
}));
vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentWritten: () => undefined,
}));

// Import after mocks are registered. `dataApi` is the bare handler here.
import { dataApi } from "../index";

type Handler = (req: unknown, res: FakeRes) => Promise<void> | void;
const handler = dataApi as unknown as Handler;

// ─── Fake req/res ────────────────────────────────────────────────────────────

interface FakeReqOpts {
  method?: string;
  path?: string;
  origin?: string;
  authorization?: string;
  query?: Record<string, string>;
  body?: unknown;
}

function makeReq(opts: FakeReqOpts = {}) {
  const headers: Record<string, string> = {};
  if (opts.origin !== undefined) headers.origin = opts.origin;
  if (opts.authorization !== undefined)
    headers.authorization = opts.authorization;
  return {
    method: opts.method ?? "GET",
    path: opts.path ?? "/",
    query: opts.query ?? {},
    body: opts.body,
    headers,
    get(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },
  };
}

// A chainable res mock that records status, headers, and the sent body.
class FakeRes {
  statusCode = 200;
  headers: Record<string, string> = {};
  jsonBody: unknown = undefined;
  sentBody: unknown = undefined;
  contentType: string | undefined = undefined;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }
  set(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }
  type(ct: string): this {
    this.contentType = ct;
    return this;
  }
  json(body: unknown): this {
    this.jsonBody = body;
    return this;
  }
  send(body: unknown): this {
    this.sentBody = body;
    return this;
  }
}

// ─── Fixtures (synthetic — public repo, no real conversation data) ───────────

const CONV_ID = "conv-test-1";
const R2_KEY = `ai-conversations/${CONV_ID}.md`;

function convReq(query: Record<string, string>) {
  return makeReq({
    method: "GET",
    path: "/ai-conversation",
    authorization: "Bearer tok",
    query,
  });
}

const MEMBER = { email: "m@gmail.com", moderator: false, admin: false };

beforeEach(() => {
  authorize.mockReset();
  presignGet.mockReset();
  presignPut.mockReset();
  getObject.mockReset();
  getAllocation.mockReset();
  isKeyAllowedForMember.mockReset();
  getIdeaData.mockReset();
  getCaptureData.mockReset();
  getAiConversationData.mockReset();
});

// ─── GET /ai-conversation ────────────────────────────────────────────────────

describe("GET /ai-conversation", () => {
  test("unauthenticated → 403, no store reads", async () => {
    authorize.mockResolvedValue(null);
    const res = new FakeRes();
    await handler(convReq({ id: CONV_ID }), res);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({ error: "forbidden" });
    expect(getAiConversationData).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
  });

  test("malformed id → 400", async () => {
    authorize.mockResolvedValue(MEMBER);
    const res = new FakeRes();
    await handler(convReq({ id: "bad id!" }), res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "bad request" });
    expect(getAiConversationData).not.toHaveBeenCalled();
  });

  test("conversation not found → 404", async () => {
    authorize.mockResolvedValue(MEMBER);
    getAiConversationData.mockResolvedValue(null);
    const res = new FakeRes();
    await handler(convReq({ id: CONV_ID }), res);
    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({ error: "not found" });
    expect(getObject).not.toHaveBeenCalled();
  });

  test("not yet captured (status pending) → 404", async () => {
    authorize.mockResolvedValue(MEMBER);
    getAiConversationData.mockResolvedValue({
      status: "pending",
      attachTo: { kind: "line", line: "medikidz" },
      r2Key: R2_KEY,
    });
    const res = new FakeRes();
    await handler(convReq({ id: CONV_ID }), res);
    expect(res.statusCode).toBe(404);
    expect(getObject).not.toHaveBeenCalled();
  });

  test("member not allowed (comic-attached, not allocated) → 403", async () => {
    authorize.mockResolvedValue(MEMBER);
    getAiConversationData.mockResolvedValue({
      status: "captured",
      attachTo: { kind: "comic", line: "biographies", comicSlug: "secret" },
      r2Key: R2_KEY,
    });
    getAllocation.mockResolvedValue({
      lines: [],
      figures: [],
      figures_effective: [],
      comics: [],
    });
    const res = new FakeRes();
    await handler(convReq({ id: CONV_ID }), res);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({ error: "forbidden" });
    expect(getObject).not.toHaveBeenCalled();
  });

  test("stored r2Key unconfined → 403, getObject NOT called", async () => {
    authorize.mockResolvedValue(MEMBER);
    getAiConversationData.mockResolvedValue({
      status: "captured",
      attachTo: { kind: "line", line: "medikidz" },
      r2Key: `ai-conversations/OTHER-conv.md`,
    });
    const res = new FakeRes();
    await handler(convReq({ id: CONV_ID }), res);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({ error: "forbidden" });
    expect(getObject).not.toHaveBeenCalled();
  });

  test("happy path: member + line-attached → 200 markdown body", async () => {
    authorize.mockResolvedValue(MEMBER);
    getAiConversationData.mockResolvedValue({
      status: "captured",
      attachTo: { kind: "line", line: "medikidz" },
      r2Key: R2_KEY,
    });
    getAllocation.mockResolvedValue({
      lines: [],
      figures: [],
      figures_effective: [],
      comics: [],
    });
    const buf = Buffer.from("# Test Conversation\n\ntranscript body");
    getObject.mockResolvedValue({ body: buf, contentType: "text/markdown" });

    const res = new FakeRes();
    await handler(convReq({ id: CONV_ID }), res);

    expect(getAiConversationData).toHaveBeenCalledWith(CONV_ID);
    // Served from EXACTLY the stored key — never a re-derived one.
    expect(getObject).toHaveBeenCalledTimes(1);
    expect(getObject).toHaveBeenCalledWith(R2_KEY);
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe("text/markdown");
    expect(res.sentBody).toBe(buf);
  });

  test("moderator sees a comic-attached conversation without an allocation read", async () => {
    authorize.mockResolvedValue({
      email: "admin@dpb.in",
      moderator: true,
      admin: true,
    });
    getAiConversationData.mockResolvedValue({
      status: "captured",
      attachTo: { kind: "comic", line: "biographies", comicSlug: "secret" },
      r2Key: R2_KEY,
    });
    const buf = Buffer.from("x");
    getObject.mockResolvedValue({ body: buf, contentType: "text/markdown" });
    const res = new FakeRes();
    await handler(convReq({ id: CONV_ID }), res);
    expect(getAllocation).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.sentBody).toBe(buf);
  });

  test("getObject throws NoSuchKey → 404", async () => {
    authorize.mockResolvedValue(MEMBER);
    getAiConversationData.mockResolvedValue({
      status: "captured",
      attachTo: { kind: "line", line: "medikidz" },
      r2Key: R2_KEY,
    });
    getAllocation.mockResolvedValue({
      lines: [],
      figures: [],
      figures_effective: [],
      comics: [],
    });
    getObject.mockRejectedValue(
      Object.assign(new Error("missing"), { name: "NoSuchKey" })
    );
    const res = new FakeRes();
    await handler(convReq({ id: CONV_ID }), res);
    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({ error: "not found" });
  });

  test("getObject throws generic error → 500", async () => {
    authorize.mockResolvedValue(MEMBER);
    getAiConversationData.mockResolvedValue({
      status: "captured",
      attachTo: { kind: "line", line: "medikidz" },
      r2Key: R2_KEY,
    });
    getAllocation.mockResolvedValue({
      lines: [],
      figures: [],
      figures_effective: [],
      comics: [],
    });
    getObject.mockRejectedValue(new Error("r2 down"));
    const res = new FakeRes();
    await handler(convReq({ id: CONV_ID }), res);
    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({ error: "ai-conversation failed" });
  });
});

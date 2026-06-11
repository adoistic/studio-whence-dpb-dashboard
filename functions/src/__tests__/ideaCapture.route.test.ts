import { beforeEach, describe, expect, test, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────
//
// Same harness as index.test.ts: `../auth`, `../r2`, `../allocation` mocked,
// `firebase-functions/v2/https` returns the bare handler. Additionally:
//   `../ideaStore` → getIdeaData/getCaptureData stubbed (no firebase-admin).
//   `../ideaAccess` → REAL (pure visibility predicate + key confinement).
//   `firebase-functions/v2/firestore` → onDocumentWritten stubbed, so the
//   trigger re-export (Task 7) never touches the Functions runtime here.

const {
  authorize,
  presignGet,
  presignPut,
  getObject,
  getAllocation,
  isKeyAllowedForMember,
  getIdeaData,
  getCaptureData,
} = vi.hoisted(() => ({
  authorize: vi.fn(),
  presignGet: vi.fn(),
  presignPut: vi.fn(),
  getObject: vi.fn(),
  getAllocation: vi.fn(),
  isKeyAllowedForMember: vi.fn(),
  getIdeaData: vi.fn(),
  getCaptureData: vi.fn(),
}));

vi.mock("../auth", () => ({ authorize }));
vi.mock("../r2", () => ({ presignGet, presignPut, getObject }));
vi.mock("../allocation", () => ({ getAllocation, isKeyAllowedForMember }));
vi.mock("../ideaStore", () => ({ getIdeaData, getCaptureData }));
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

// ─── Fixtures (synthetic — public repo, no real share/conversation data) ─────

const IDEA_ID = "idea-test-1";
const CAPTURE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const R2_KEY = `idea-captures/${IDEA_ID}/${CAPTURE_ID}.md`;

function captureReq(query: Record<string, string>) {
  return makeReq({
    method: "GET",
    path: "/idea-capture",
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
});

// ─── GET /idea-capture ───────────────────────────────────────────────────────

describe("GET /idea-capture", () => {
  test("unauthenticated → 403, no store reads", async () => {
    authorize.mockResolvedValue(null);
    const res = new FakeRes();
    await handler(captureReq({ ideaId: IDEA_ID, captureId: CAPTURE_ID }), res);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({ error: "forbidden" });
    expect(getIdeaData).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
  });

  test("missing ideaId → 400", async () => {
    authorize.mockResolvedValue(MEMBER);
    const res = new FakeRes();
    await handler(captureReq({ captureId: CAPTURE_ID }), res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "bad request" });
    expect(getIdeaData).not.toHaveBeenCalled();
  });

  test("malformed captureId (too short) → 400", async () => {
    authorize.mockResolvedValue(MEMBER);
    const res = new FakeRes();
    await handler(captureReq({ ideaId: IDEA_ID, captureId: "SHORT" }), res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "bad request" });
    expect(getIdeaData).not.toHaveBeenCalled();
  });

  test("idea not found → 404", async () => {
    authorize.mockResolvedValue(MEMBER);
    getIdeaData.mockResolvedValue(null);
    const res = new FakeRes();
    await handler(captureReq({ ideaId: IDEA_ID, captureId: CAPTURE_ID }), res);
    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({ error: "not found" });
    expect(getCaptureData).not.toHaveBeenCalled();
  });

  test("member without visibility (someone else's private idea) → 403", async () => {
    authorize.mockResolvedValue(MEMBER);
    getIdeaData.mockResolvedValue({
      author: "someone-else@dpb.in",
      visibility: "private",
    });
    const res = new FakeRes();
    await handler(captureReq({ ideaId: IDEA_ID, captureId: CAPTURE_ID }), res);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({ error: "forbidden" });
    expect(getCaptureData).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
  });

  test("capture doc missing → 404", async () => {
    authorize.mockResolvedValue(MEMBER);
    getIdeaData.mockResolvedValue({
      author: "someone-else@dpb.in",
      visibility: "all_approved",
    });
    getCaptureData.mockResolvedValue(null);
    const res = new FakeRes();
    await handler(captureReq({ ideaId: IDEA_ID, captureId: CAPTURE_ID }), res);
    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({ error: "not found" });
    expect(getObject).not.toHaveBeenCalled();
  });

  test("capture not yet captured (status pending) → 404", async () => {
    authorize.mockResolvedValue(MEMBER);
    getIdeaData.mockResolvedValue({
      author: "someone-else@dpb.in",
      visibility: "all_approved",
    });
    getCaptureData.mockResolvedValue({ status: "pending", r2Key: null });
    const res = new FakeRes();
    await handler(captureReq({ ideaId: IDEA_ID, captureId: CAPTURE_ID }), res);
    expect(res.statusCode).toBe(404);
    expect(getObject).not.toHaveBeenCalled();
  });

  test("stored r2Key outside idea-captures/<ideaId>/ → 403, getObject NOT called", async () => {
    authorize.mockResolvedValue(MEMBER);
    getIdeaData.mockResolvedValue({
      author: "someone-else@dpb.in",
      visibility: "all_approved",
    });
    getCaptureData.mockResolvedValue({
      status: "captured",
      r2Key: `idea-captures/OTHER-idea/${CAPTURE_ID}.md`,
    });
    const res = new FakeRes();
    await handler(captureReq({ ideaId: IDEA_ID, captureId: CAPTURE_ID }), res);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({ error: "forbidden" });
    expect(getObject).not.toHaveBeenCalled();
  });

  test("happy path: member + all_approved idea → 200 markdown body", async () => {
    authorize.mockResolvedValue(MEMBER);
    getIdeaData.mockResolvedValue({
      author: "someone-else@dpb.in",
      visibility: "all_approved",
    });
    getCaptureData.mockResolvedValue({ status: "captured", r2Key: R2_KEY });
    const buf = Buffer.from("# Test Conversation\n\ntranscript body");
    getObject.mockResolvedValue({ body: buf, contentType: "text/markdown" });

    const res = new FakeRes();
    await handler(captureReq({ ideaId: IDEA_ID, captureId: CAPTURE_ID }), res);

    expect(getIdeaData).toHaveBeenCalledWith(IDEA_ID);
    expect(getCaptureData).toHaveBeenCalledWith(IDEA_ID, CAPTURE_ID);
    // Served from EXACTLY the stored key — never a re-derived one.
    expect(getObject).toHaveBeenCalledTimes(1);
    expect(getObject).toHaveBeenCalledWith(R2_KEY);
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe("text/markdown");
    expect(res.sentBody).toBe(buf);
  });

  test("uppercase captureId is normalized before lookup", async () => {
    authorize.mockResolvedValue(MEMBER);
    getIdeaData.mockResolvedValue({ visibility: "all_approved" });
    getCaptureData.mockResolvedValue({ status: "captured", r2Key: R2_KEY });
    getObject.mockResolvedValue({
      body: Buffer.from("x"),
      contentType: "text/markdown",
    });
    const res = new FakeRes();
    await handler(
      captureReq({ ideaId: IDEA_ID, captureId: CAPTURE_ID.toUpperCase() }),
      res
    );
    expect(getCaptureData).toHaveBeenCalledWith(IDEA_ID, CAPTURE_ID);
    expect(res.statusCode).toBe(200);
  });

  test("getObject throws NoSuchKey → 404", async () => {
    authorize.mockResolvedValue(MEMBER);
    getIdeaData.mockResolvedValue({ visibility: "all_approved" });
    getCaptureData.mockResolvedValue({ status: "captured", r2Key: R2_KEY });
    getObject.mockRejectedValue(
      Object.assign(new Error("missing"), { name: "NoSuchKey" })
    );
    const res = new FakeRes();
    await handler(captureReq({ ideaId: IDEA_ID, captureId: CAPTURE_ID }), res);
    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({ error: "not found" });
  });

  test("getObject throws generic error → 500", async () => {
    authorize.mockResolvedValue(MEMBER);
    getIdeaData.mockResolvedValue({ visibility: "all_approved" });
    getCaptureData.mockResolvedValue({ status: "captured", r2Key: R2_KEY });
    getObject.mockRejectedValue(new Error("r2 down"));
    const res = new FakeRes();
    await handler(captureReq({ ideaId: IDEA_ID, captureId: CAPTURE_ID }), res);
    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({ error: "idea-capture failed" });
  });
});

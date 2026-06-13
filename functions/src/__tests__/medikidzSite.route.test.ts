import { beforeEach, describe, expect, test, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────
//
// Same harness as ideaCapture.route.test.ts: `../auth`, `../r2`, `../allocation`
// mocked; `firebase-functions/v2/https` returns the bare handler. `../medikidzSite`
// stays REAL (pure rewrite). ideaStore/firestore are stubbed only so the
// re-exported trigger in index.ts doesn't touch the Functions runtime.

const {
  authorize,
  presignGet,
  presignPut,
  getObject,
  getAllocation,
  isKeyAllowedForMember,
} = vi.hoisted(() => ({
  authorize: vi.fn(),
  presignGet: vi.fn(),
  presignPut: vi.fn(),
  getObject: vi.fn(),
  getAllocation: vi.fn(),
  isKeyAllowedForMember: vi.fn(),
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
  getIdeaData: vi.fn(),
  getCaptureData: vi.fn(),
  createCapture: vi.fn(),
  markCaptured: vi.fn(),
  markFailed: vi.fn(),
  listCaptureIds: vi.fn(),
  deleteCaptureDoc: vi.fn(),
}));
vi.mock("firebase-functions/v2/https", () => ({
  onRequest: (arg1: unknown, arg2?: unknown) =>
    typeof arg1 === "function" ? arg1 : arg2,
}));
vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentWritten: () => undefined,
}));

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
  if (opts.authorization !== undefined) headers.authorization = opts.authorization;
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

const MEMBER = { email: "m@gmail.com", moderator: false, admin: false };
const MOD = { email: "mod@dpb.in", moderator: true, admin: false };

function siteReq() {
  return makeReq({
    method: "GET",
    path: "/medikidz-site",
    authorization: "Bearer tok",
  });
}

// A representative slice of the real page: a static <img> + a JS BOOKS literal.
const SITE_HTML = [
  '<!doctype html><html><body>',
  '<img src="assets/covers/01.jpg">',
  '<script>const BOOKS=[{cover:"assets/covers/02.jpg",pages:[{src:"assets/pages/01.jpg"}]}];</script>',
  '</body></html>',
].join("\n");

beforeEach(() => {
  authorize.mockReset();
  presignGet.mockReset();
  presignPut.mockReset();
  getObject.mockReset();
  getAllocation.mockReset();
  isKeyAllowedForMember.mockReset();
});

describe("GET /medikidz-site", () => {
  test("unauthenticated → 401, no R2 reads", async () => {
    authorize.mockResolvedValue(null);
    const res = new FakeRes();
    await handler(siteReq(), res);
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toEqual({ error: "unauthorized" });
    expect(getObject).not.toHaveBeenCalled();
  });

  test("member not allowed the site key → 403", async () => {
    authorize.mockResolvedValue(MEMBER);
    getAllocation.mockResolvedValue(null);
    isKeyAllowedForMember.mockResolvedValue(false);
    const res = new FakeRes();
    await handler(siteReq(), res);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({ error: "forbidden" });
    expect(getObject).not.toHaveBeenCalled();
  });

  test("allowed member → 200 html with presigned image URLs, no bare path", async () => {
    authorize.mockResolvedValue(MEMBER);
    getAllocation.mockResolvedValue({
      lines: [],
      figures: [],
      figures_effective: [],
      comics: [],
    });
    isKeyAllowedForMember.mockResolvedValue(true);
    getObject.mockResolvedValue({
      body: Buffer.from(SITE_HTML, "utf-8"),
      contentType: "text/html",
    });
    presignGet.mockImplementation((k: string) =>
      Promise.resolve(`https://r2.example/${k}?sig=X`)
    );

    const res = new FakeRes();
    await handler(siteReq(), res);

    // Served from EXACTLY the hard-coded site key.
    expect(getObject).toHaveBeenCalledTimes(1);
    expect(getObject).toHaveBeenCalledWith("sites/medikidz/index.html");
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe("text/html");
    const html = String(res.sentBody);
    expect(html).toContain(
      "https://r2.example/sites/medikidz/assets/covers/01.jpg?sig=X"
    );
    expect(html).toContain(
      "https://r2.example/sites/medikidz/assets/covers/02.jpg?sig=X"
    );
    expect(html).toContain(
      "https://r2.example/sites/medikidz/assets/pages/01.jpg?sig=X"
    );
    // No bare (quoted) asset path survives.
    expect(html).not.toMatch(/["']assets\/(covers|pages)\//);
  });

  test("moderator → 200 without an allocation read", async () => {
    authorize.mockResolvedValue(MOD);
    getObject.mockResolvedValue({
      body: Buffer.from(SITE_HTML, "utf-8"),
      contentType: "text/html",
    });
    presignGet.mockImplementation((k: string) =>
      Promise.resolve(`https://r2.example/${k}?sig=X`)
    );
    const res = new FakeRes();
    await handler(siteReq(), res);
    expect(res.statusCode).toBe(200);
    expect(getAllocation).not.toHaveBeenCalled();
    expect(isKeyAllowedForMember).not.toHaveBeenCalled();
  });

  test("getObject throws NoSuchKey → 404", async () => {
    authorize.mockResolvedValue(MOD);
    getObject.mockRejectedValue(
      Object.assign(new Error("missing"), { name: "NoSuchKey" })
    );
    const res = new FakeRes();
    await handler(siteReq(), res);
    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({ error: "not found" });
  });

  test("getObject throws generic error → 500", async () => {
    authorize.mockResolvedValue(MOD);
    getObject.mockRejectedValue(new Error("r2 down"));
    const res = new FakeRes();
    await handler(siteReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({ error: "medikidz-site failed" });
  });
});

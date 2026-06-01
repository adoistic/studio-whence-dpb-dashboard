import { beforeEach, describe, expect, test, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────
//
// `./auth`   → `authorize` is controllable per-test (resolves {email} or null).
// `./r2`     → `presignGet` + `getObject` are stubbed (no AWS SDK / network).
// `./keys`   → REAL (it is pure path-safety logic; we want its true behavior).
// `firebase-functions/v2/https` → `onRequest` just returns the handler so we can
//             invoke it directly with fake req/res — no Functions runtime.

// `vi.mock` factories are hoisted above imports, so the mock fns must be
// created with `vi.hoisted` to be referenceable inside the factories.
const { authorize, presignGet, getObject } = vi.hoisted(() => ({
  authorize: vi.fn(),
  presignGet: vi.fn(),
  getObject: vi.fn(),
}));

vi.mock("../auth", () => ({ authorize }));
vi.mock("../r2", () => ({ presignGet, getObject }));
vi.mock("firebase-functions/v2/https", () => ({
  // The real call shape is `onRequest(options, handler)`, but it may also be
  // called as `onRequest(handler)`. The actual handler is the function arg.
  onRequest: (arg1: unknown, arg2?: unknown) =>
    typeof arg1 === "function" ? arg1 : arg2,
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
  setHeader(name: string, value: string): this {
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

beforeEach(() => {
  authorize.mockReset();
  presignGet.mockReset();
  getObject.mockReset();
});

const ALLOWED_ORIGIN = "https://studio-whence-dpb.web.app";

// ─── CORS preflight ──────────────────────────────────────────────────────────

describe("CORS preflight (OPTIONS)", () => {
  test("allowed origin → 204 with ACAO echo + allow-headers/methods", async () => {
    const req = makeReq({ method: "OPTIONS", origin: ALLOWED_ORIGIN });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
    expect(res.headers["Access-Control-Allow-Headers"]).toBe(
      "Authorization, Content-Type"
    );
    expect(res.headers["Access-Control-Allow-Methods"]).toBe(
      "GET, POST, OPTIONS"
    );
    expect(res.headers["Vary"]).toBe("Origin");
    // Preflight must not require auth.
    expect(authorize).not.toHaveBeenCalled();
  });

  test("disallowed origin → 204 but NO ACAO header", async () => {
    const req = makeReq({ method: "OPTIONS", origin: "https://evil.example" });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

// ─── GET /content ────────────────────────────────────────────────────────────

describe("GET /content", () => {
  test("authorized → getObject('content.json'), 200 with its body", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    const buf = Buffer.from('{"hello":"world"}');
    getObject.mockResolvedValue({ body: buf, contentType: "application/json" });

    const req = makeReq({
      method: "GET",
      path: "/content",
      origin: ALLOWED_ORIGIN,
      authorization: "Bearer tok",
    });
    const res = new FakeRes();
    await handler(req, res);

    expect(getObject).toHaveBeenCalledWith("content.json");
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe("application/json");
    expect(res.sentBody).toBe(buf);
    // CORS header present on the success response too.
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
  });

  test("unauthorized (authorize → null) → 403, getObject never called", async () => {
    authorize.mockResolvedValue(null);
    const req = makeReq({
      method: "GET",
      path: "/content",
      origin: ALLOWED_ORIGIN,
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({ error: "forbidden" });
    expect(getObject).not.toHaveBeenCalled();
    // CORS header present on the 403 too.
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
  });

  test("never presigns content.json (presignGet untouched)", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    getObject.mockResolvedValue({
      body: Buffer.from("{}"),
      contentType: "application/json",
    });
    const req = makeReq({
      method: "GET",
      path: "/content",
      authorization: "Bearer tok",
    });
    await handler(req, new FakeRes());
    expect(presignGet).not.toHaveBeenCalled();
  });

  test("R2 error → 500", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    getObject.mockRejectedValue(new Error("r2 down"));
    const req = makeReq({
      method: "GET",
      path: "/content",
      authorization: "Bearer tok",
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /resolve ───────────────────────────────────────────────────────────

describe("POST /resolve", () => {
  test("mix of valid + invalid keys → invalid dropped, valid presigned", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    presignGet.mockImplementation(async (k: string) => `https://signed/${k}`);

    const req = makeReq({
      method: "POST",
      path: "/resolve",
      authorization: "Bearer tok",
      body: {
        keys: [
          "research/a.md", // valid
          "secrets/x", // invalid prefix → dropped
          "../content.json", // traversal → dropped
          "images/y.png", // valid
        ],
      },
    });
    const res = new FakeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      urls: {
        "research/a.md": "https://signed/research/a.md",
        "images/y.png": "https://signed/images/y.png",
      },
    });
    expect(presignGet).toHaveBeenCalledTimes(2);
  });

  test("string JSON body is tolerated (parsed)", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    presignGet.mockImplementation(async (k: string) => `https://signed/${k}`);
    const req = makeReq({
      method: "POST",
      path: "/resolve",
      authorization: "Bearer tok",
      body: JSON.stringify({ keys: ["drafts/d.md"] }),
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      urls: { "drafts/d.md": "https://signed/drafts/d.md" },
    });
  });

  test(">50 keys → 400", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    const keys = Array.from({ length: 51 }, (_, i) => `research/${i}.md`);
    const req = makeReq({
      method: "POST",
      path: "/resolve",
      authorization: "Bearer tok",
      body: { keys },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "too many keys" });
    expect(presignGet).not.toHaveBeenCalled();
  });

  test("keys not an array → 400", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    const req = makeReq({
      method: "POST",
      path: "/resolve",
      authorization: "Bearer tok",
      body: { keys: "research/a.md" },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  test("unauthorized → 403 (CORS header present)", async () => {
    authorize.mockResolvedValue(null);
    const req = makeReq({
      method: "POST",
      path: "/resolve",
      origin: ALLOWED_ORIGIN,
      body: { keys: ["research/a.md"] },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(presignGet).not.toHaveBeenCalled();
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
  });

  test(">50 keys → 400 (CORS header present)", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    const keys = Array.from({ length: 51 }, (_, i) => `research/${i}.md`);
    const req = makeReq({
      method: "POST",
      path: "/resolve",
      origin: ALLOWED_ORIGIN,
      authorization: "Bearer tok",
      body: { keys },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "too many keys" });
    expect(presignGet).not.toHaveBeenCalled();
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
  });

  test("presignGet throws → 500", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    presignGet.mockRejectedValue(new Error("r2 down"));
    const req = makeReq({
      method: "POST",
      path: "/resolve",
      authorization: "Bearer tok",
      body: { keys: ["research/a.md"] },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({ error: "resolve failed" });
  });

  test("all keys invalid → 200 { urls: {} }, presignGet never called", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    const req = makeReq({
      method: "POST",
      path: "/resolve",
      authorization: "Bearer tok",
      body: { keys: ["secrets/x", "../content.json"] },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ urls: {} });
    expect(presignGet).not.toHaveBeenCalled();
  });
});

// ─── GET /read ───────────────────────────────────────────────────────────────

describe("GET /read", () => {
  test("authorized with a safe key → getObject(safeKey), 200 body", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    const buf = Buffer.from("# heading");
    getObject.mockResolvedValue({ body: buf, contentType: "text/markdown" });
    const req = makeReq({
      method: "GET",
      path: "/read",
      authorization: "Bearer tok",
      query: { key: "research/x.md" },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(getObject).toHaveBeenCalledWith("research/x.md");
    expect(res.statusCode).toBe(200);
    expect(res.sentBody).toBe(buf);
    expect(res.contentType).toBe("text/markdown");
  });

  test("disallowed prefix key (secrets/) → 403, getObject never called (CORS header present)", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    const req = makeReq({
      method: "GET",
      path: "/read",
      origin: ALLOWED_ORIGIN,
      authorization: "Bearer tok",
      query: { key: "secrets/x" },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(getObject).not.toHaveBeenCalled();
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
  });

  test("no ?key= param at all → 403 (safeKey('') is null)", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    const req = makeReq({
      method: "GET",
      path: "/read",
      authorization: "Bearer tok",
      // no query.key
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(getObject).not.toHaveBeenCalled();
  });

  test("traversal key (../content.json) → 403", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    const req = makeReq({
      method: "GET",
      path: "/read",
      authorization: "Bearer tok",
      query: { key: "../content.json" },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(getObject).not.toHaveBeenCalled();
  });

  test("unauthorized → 403", async () => {
    authorize.mockResolvedValue(null);
    const req = makeReq({
      method: "GET",
      path: "/read",
      query: { key: "research/x.md" },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(getObject).not.toHaveBeenCalled();
  });

  test("NoSuchKey error → 404 (CORS header present)", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    getObject.mockRejectedValue(
      Object.assign(new Error("missing"), { name: "NoSuchKey" })
    );
    const req = makeReq({
      method: "GET",
      path: "/read",
      origin: ALLOWED_ORIGIN,
      authorization: "Bearer tok",
      query: { key: "research/missing.md" },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
  });

  test("other R2 error → 500 (CORS header present)", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    getObject.mockRejectedValue(new Error("r2 down"));
    const req = makeReq({
      method: "GET",
      path: "/read",
      origin: ALLOWED_ORIGIN,
      authorization: "Bearer tok",
      query: { key: "research/x.md" },
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
  });
});

// ─── Emulator path shape + unknown route ──────────────────────────────────────

describe("routing", () => {
  test("emulator path /dataApi/content still routes to content", async () => {
    authorize.mockResolvedValue({ email: "x@thothica.com" });
    getObject.mockResolvedValue({
      body: Buffer.from("{}"),
      contentType: "application/json",
    });
    const req = makeReq({
      method: "GET",
      path: "/dataApi/content",
      authorization: "Bearer tok",
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(getObject).toHaveBeenCalledWith("content.json");
    expect(res.statusCode).toBe(200);
  });

  test("unknown route → 404 (with CORS header)", async () => {
    const req = makeReq({
      method: "GET",
      path: "/nope",
      origin: ALLOWED_ORIGIN,
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
  });

  test("wrong method on a known route (POST /content) → 404", async () => {
    const req = makeReq({
      method: "POST",
      path: "/content",
      authorization: "Bearer tok",
    });
    const res = new FakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });
});

import { describe, expect, test, vi } from "vitest";

// Importing ../healPages runs its module-level onSchedule() registration + admin
// init. Stub those so the import is hermetic (no Functions runtime / no admin
// app / no AWS). computePagesFromR2 + reconcile are pure and use none of them.
vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock("firebase-admin/app", () => ({ getApps: () => [{}], initializeApp: () => ({}) }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => ({}) }));
vi.mock("../r2", () => ({ listKeysUnderPrefix: vi.fn() }));

// Pure logic only — no firebase-admin / AWS / scheduler runtime. The handler
// wiring (list R2 → read Firestore → batch update) is thin glue over these two
// pure functions, which carry all the decision logic.
import { computePagesFromR2, reconcile, type PagesBlock } from "../healPages";

describe("computePagesFromR2", () => {
  test("cover + contiguous pages → block with count = max index and coverKey", () => {
    const keys = [
      "images/comics/toddlers/numbers/cover.jpg",
      "images/comics/toddlers/numbers/pages/page-01.jpg",
      "images/comics/toddlers/numbers/pages/page-02.jpg",
      "images/comics/toddlers/numbers/pages/page-03.jpg",
    ];
    const out = computePagesFromR2(keys);
    expect(out.get("toddlers__numbers")).toEqual({
      hasPages: true,
      count: 3,
      coverKey: "images/comics/toddlers/numbers/cover.jpg",
    });
  });

  test("pages without a cover → coverKey null", () => {
    const out = computePagesFromR2([
      "images/comics/indic/01-one-soul/pages/page-01.jpg",
      "images/comics/indic/01-one-soul/pages/page-02.jpg",
    ]);
    expect(out.get("indic__01-one-soul")).toEqual({
      hasPages: true,
      count: 2,
      coverKey: null,
    });
  });

  test("non-contiguous pages (a gap) are skipped, not emitted", () => {
    const out = computePagesFromR2([
      "images/comics/awareness/x/pages/page-01.jpg",
      "images/comics/awareness/x/pages/page-03.jpg", // page-02 missing
    ]);
    expect(out.has("awareness__x")).toBe(false);
  });

  test("ignores unrelated keys and cover-only comics", () => {
    const out = computePagesFromR2([
      "images/comics/toddlers/z/cover.jpg", // cover but no pages
      "drafts/toddlers/z.html",
      "docs/comics/toddlers/z/bundle.md",
    ]);
    expect(out.size).toBe(0);
  });

  test("separates multiple comics", () => {
    const out = computePagesFromR2([
      "images/comics/tingaland/01-rhymes/pages/page-01.jpg",
      "images/comics/toddlers/numbers/pages/page-01.jpg",
      "images/comics/toddlers/numbers/pages/page-02.jpg",
    ]);
    expect(out.get("tingaland__01-rhymes")?.count).toBe(1);
    expect(out.get("toddlers__numbers")?.count).toBe(2);
  });
});

describe("reconcile", () => {
  const desired: PagesBlock = { hasPages: true, count: 48, coverKey: "images/comics/toddlers/numbers/cover.jpg" };

  test("legacy comic is never touched", () => {
    expect(reconcile(undefined, desired, true)).toBeNull();
  });

  test("no R2 art → leave doc alone (never blank)", () => {
    expect(reconcile({ hasPages: true, count: 9, coverKey: null }, undefined, false)).toBeNull();
  });

  test("missing pages block → write the desired block", () => {
    expect(reconcile(undefined, desired, false)).toEqual(desired);
  });

  test("stored block already matches → no write", () => {
    expect(reconcile({ ...desired }, desired, false)).toBeNull();
  });

  test("count drift → rewrite (fixes over-count 404s and under-count blanks)", () => {
    expect(reconcile({ hasPages: true, count: 40, coverKey: desired.coverKey }, desired, false)).toEqual(desired);
  });

  test("cover drift → rewrite", () => {
    expect(reconcile({ hasPages: true, count: 48, coverKey: null }, desired, false)).toEqual(desired);
  });

  test("treats missing coverKey field as null when comparing", () => {
    const noCover: PagesBlock = { hasPages: true, count: 2, coverKey: null };
    expect(reconcile({ hasPages: true, count: 2 }, noCover, false)).toBeNull();
  });
});

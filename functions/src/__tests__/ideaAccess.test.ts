import { describe, expect, test } from "vitest";
import { canReadIdea, captureR2KeyIsConfined } from "../ideaAccess";

const caller = (over: Partial<{ email: string; moderator: boolean; admin: boolean }> = {}) => ({
  email: "m@dpb.in", moderator: false, admin: false, ...over,
});

describe("canReadIdea — mirrors the firestore ideas read rule", () => {
  const idea = (over: Record<string, unknown> = {}) => ({
    author: "author@dpb.in", visibility: "private", recipients: [], ...over,
  });
  test("admin reads anything", () =>
    expect(canReadIdea(caller({ admin: true }), idea())).toBe(true));
  test("author reads own private idea", () =>
    expect(canReadIdea(caller({ email: "author@dpb.in" }), idea())).toBe(true));
  test("non-author denied on private", () =>
    expect(canReadIdea(caller(), idea())).toBe(false));
  test("sub_admin (moderator) denied on someone else's private idea", () =>
    expect(canReadIdea(caller({ moderator: true }), idea())).toBe(false));
  test("all_sub_admins requires moderator", () => {
    expect(canReadIdea(caller(), idea({ visibility: "all_sub_admins" }))).toBe(false);
    expect(canReadIdea(caller({ moderator: true }), idea({ visibility: "all_sub_admins" }))).toBe(true);
  });
  test("all_approved readable by any authorized caller", () =>
    expect(canReadIdea(caller(), idea({ visibility: "all_approved" }))).toBe(true));
  test("specific readable only by listed recipients", () => {
    expect(canReadIdea(caller(), idea({ visibility: "specific", recipients: ["m@dpb.in"] }))).toBe(true);
    expect(canReadIdea(caller(), idea({ visibility: "specific", recipients: ["x@dpb.in"] }))).toBe(false);
  });
  test("malformed idea doc denies (fail closed)", () =>
    expect(canReadIdea(caller(), { author: 7, visibility: 9, recipients: "x" })).toBe(false));
});

describe("captureR2KeyIsConfined", () => {
  test("accepts the canonical key", () =>
    expect(captureR2KeyIsConfined("idea-1", "idea-captures/idea-1/abc-def.md")).toBe(true));
  test("rejects other prefixes and traversal", () => {
    expect(captureR2KeyIsConfined("idea-1", "docs/x.md")).toBe(false);
    expect(captureR2KeyIsConfined("idea-1", "idea-captures/other/abc.md")).toBe(false);
    expect(captureR2KeyIsConfined("idea-1", "idea-captures/idea-1/../secrets")).toBe(false);
  });
});

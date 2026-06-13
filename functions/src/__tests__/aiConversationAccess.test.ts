import { describe, expect, test } from "vitest";
import {
  aiConvR2KeyIsConfined,
  canReadAiConversation,
} from "../aiConversationAccess";

const auth = (
  over: Partial<{ email: string; moderator: boolean; admin: boolean }> = {}
) => ({ email: "m@dpb.in", moderator: false, admin: false, ...over });

const conv = (
  attachTo: {
    kind: "comic" | "line" | "figure" | "idea";
    line: string;
    comicSlug?: string;
    figureSlug?: string;
    open?: boolean;
  }
) => ({ attachTo });

describe("canReadAiConversation — LOCKED visibility decision", () => {
  test("null auth is denied", () =>
    expect(
      canReadAiConversation(null, conv({ kind: "line", line: "biographies" }))
    ).toBe(false));

  test("moderator reads anything", () => {
    expect(
      canReadAiConversation(
        auth({ moderator: true }),
        conv({ kind: "comic", line: "biographies", comicSlug: "x" })
      )
    ).toBe(true);
    expect(
      canReadAiConversation(
        auth({ moderator: true }),
        conv({ kind: "figure", line: "biographies" })
      )
    ).toBe(true);
  });

  test("line-attached is readable by any plain member", () =>
    expect(
      canReadAiConversation(auth(), conv({ kind: "line", line: "medicomics" }))
    ).toBe(true));

  test("comic-attached is readable only when allocated that comic", () => {
    const c = conv({ kind: "comic", line: "biographies", comicSlug: "x" });
    // not allocated → denied
    expect(canReadAiConversation(auth(), c)).toBe(false);
    // allocated the comic id → allowed
    expect(
      canReadAiConversation(auth(), c, {
        comics: ["biographies__x"],
        lines: [],
      })
    ).toBe(true);
    // allocated a different comic → denied
    expect(
      canReadAiConversation(auth(), c, {
        comics: ["biographies__y"],
        lines: [],
      })
    ).toBe(false);
    // member has the whole line → allowed
    expect(
      canReadAiConversation(auth(), c, {
        comics: [],
        lines: ["biographies"],
      })
    ).toBe(true);
  });

  test("figure-attached + open:true is readable by a plain member (no alloc)", () =>
    expect(
      canReadAiConversation(
        auth(),
        conv({ kind: "figure", line: "medicomics", figureSlug: "obesity", open: true })
      )
    ).toBe(true));

  test("figure-attached + open:false + no alloc is denied", () =>
    expect(
      canReadAiConversation(
        auth(),
        conv({ kind: "figure", line: "medicomics", figureSlug: "obesity", open: false })
      )
    ).toBe(false));

  test("figure-attached + open:false is readable by a member holding that line", () =>
    expect(
      canReadAiConversation(
        auth(),
        conv({ kind: "figure", line: "medicomics", figureSlug: "obesity", open: false }),
        { comics: [], lines: ["medicomics"] }
      )
    ).toBe(true));

  test("figure-attached + open:true + auth null is denied", () =>
    expect(
      canReadAiConversation(
        null,
        conv({ kind: "figure", line: "medicomics", figureSlug: "obesity", open: true })
      )
    ).toBe(false));

  test("figure-attached is readable by a moderator regardless of open flag", () =>
    expect(
      canReadAiConversation(
        auth({ moderator: true }),
        conv({ kind: "figure", line: "medicomics", figureSlug: "obesity", open: false })
      )
    ).toBe(true));

  test("figure-attached (no open flag, no alloc) is denied for a plain member", () =>
    expect(
      canReadAiConversation(auth(), conv({ kind: "figure", line: "biographies" }))
    ).toBe(false));

  test("idea-attached (any other kind) is denied for a plain member", () =>
    expect(
      canReadAiConversation(auth(), conv({ kind: "idea", line: "biographies" }))
    ).toBe(false));
});

describe("aiConvR2KeyIsConfined", () => {
  test("accepts the canonical key", () =>
    expect(
      aiConvR2KeyIsConfined("conv-1", "ai-conversations/conv-1.md")
    ).toBe(true));
  test("rejects other ids, prefixes, and traversal", () => {
    expect(aiConvR2KeyIsConfined("conv-1", "ai-conversations/conv-2.md")).toBe(
      false
    );
    expect(aiConvR2KeyIsConfined("conv-1", "docs/conv-1.md")).toBe(false);
    expect(
      aiConvR2KeyIsConfined("conv-1", "ai-conversations/conv-1.md/../secret")
    ).toBe(false);
    expect(
      aiConvR2KeyIsConfined("conv-1", "ai-conversations/../secret.md")
    ).toBe(false);
  });
});

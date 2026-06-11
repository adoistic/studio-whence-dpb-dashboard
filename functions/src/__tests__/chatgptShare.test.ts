import { describe, expect, test } from "vitest";
import {
  extractShareLinks,
  fetchUrlFor,
  parseShareHtml,
  transcriptMarkdown,
} from "../chatgptShare";

// ─── Synthetic turbo-stream fixture (NO real conversation data — public repo) ──
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

describe("extractShareLinks", () => {
  test("finds chatgpt.com and chat.openai.com links, dedupes, preserves order", () => {
    const md = [
      "first https://chatgpt.com/share/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee ok",
      "dupe https://chatgpt.com/share/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "legacy https://chat.openai.com/share/11111111-2222-3333-4444-555555555555",
    ].join("\n");
    const links = extractShareLinks(md);
    expect(links).toEqual([
      {
        url: "https://chatgpt.com/share/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        shareId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      },
      {
        url: "https://chat.openai.com/share/11111111-2222-3333-4444-555555555555",
        shareId: "11111111-2222-3333-4444-555555555555",
      },
    ]);
  });

  test("uppercase hex normalizes to one shareId", () => {
    const md =
      "https://chatgpt.com/share/AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE and " +
      "https://chatgpt.com/share/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(extractShareLinks(md)).toHaveLength(1);
  });

  test("ignores short ids, other hosts, and non-share paths", () => {
    const md = [
      "https://chatgpt.com/share/short",
      "https://example.com/share/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "https://chatgpt.com/c/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "no links at all",
    ].join("\n");
    expect(extractShareLinks(md)).toEqual([]);
  });

  test("trailing /continue is not part of the id", () => {
    const links = extractShareLinks(
      "https://chatgpt.com/share/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/continue"
    );
    expect(links).toHaveLength(1);
    expect(links[0].shareId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });
});

describe("fetchUrlFor", () => {
  test("always normalizes to chatgpt.com", () => {
    expect(fetchUrlFor("abc-def")).toBe("https://chatgpt.com/share/abc-def");
  });
});

describe("parseShareHtml", () => {
  test("decodes the synthetic payload", () => {
    const parsed = parseShareHtml(syntheticHtml());
    expect(parsed.title).toBe("Test Conversation");
    expect(parsed.model).toBe("gpt-5-5");
    expect(parsed.createTime).toBe(1700000000.5);
    expect(parsed.messages).toEqual([
      { role: "user", text: "Hello from the user" },
      { role: "assistant", text: "Hi! This is the assistant reply." },
    ]);
  });

  test("payload containing an escaped quote sequence still parses", () => {
    const values = JSON.parse(JSON.stringify(VALUES)) as unknown[];
    values[37] = 'tricky "); content';
    const parsed = parseShareHtml(syntheticHtml(values));
    expect(parsed.messages[0].text).toBe('tricky "); content');
  });

  test("throws a parse error when there is no payload", () => {
    expect(() => parseShareHtml("<html><body>nope</body></html>")).toThrow(
      /parse: no turbo-stream payload/
    );
  });

  test("throws when linear_conversation is missing", () => {
    // Truncate the data object: keep only title.
    const values = JSON.parse(JSON.stringify(VALUES)) as unknown[];
    values[8] = { _9: 10 };
    expect(() => parseShareHtml(syntheticHtml(values))).toThrow(
      /parse: no linear_conversation/
    );
  });
});

describe("transcriptMarkdown", () => {
  test("renders the golden transcript", () => {
    const parsed = parseShareHtml(syntheticHtml());
    const md = transcriptMarkdown(
      parsed,
      "https://chatgpt.com/share/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "2026-06-11T12:00:00.000Z"
    );
    expect(md).toBe(
      [
        "# Test Conversation",
        "",
        "- Source: https://chatgpt.com/share/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "- Captured: 2026-06-11T12:00:00.000Z",
        "- Model: gpt-5-5",
        "- Conversation created: 2023-11-14T22:13:20.500Z",
        "- Messages: 2",
        "",
        "---",
        "",
        "## User",
        "",
        "Hello from the user",
        "",
        "## ChatGPT",
        "",
        "Hi! This is the assistant reply.",
        "",
      ].join("\n")
    );
  });
});

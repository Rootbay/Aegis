import { describe, expect, it } from "vitest";

import {
  buildLowercaseContent,
  matchNormalizedMessages,
  normalizeSearchQuery,
  type MessageContentCache,
} from "../../src/lib/features/chat/utils/chatSearch";

const createMessages = (
  entries: Array<{ id: string; content: string }>,
): Array<{ id: string; content: string }> => entries;

describe("buildLowercaseContent", () => {
  it("caches lower-case content per message id", () => {
    const cache: MessageContentCache = new Map();
    const messages = createMessages([
      { id: "1", content: "Hello World" },
      { id: "2", content: "Second MESSAGE" },
    ]);

    const normalizedFirst = buildLowercaseContent(messages, cache);
    expect(normalizedFirst).toEqual(["hello world", "second message"]);

    const cachedFirst = cache.get("1");
    const cachedSecond = cache.get("2");
    expect(cachedFirst).toMatchObject({
      original: "Hello World",
      lower: "hello world",
    });
    expect(cachedSecond).toMatchObject({
      original: "Second MESSAGE",
      lower: "second message",
    });

    const normalizedSecond = buildLowercaseContent(messages, cache);
    expect(normalizedSecond).toEqual(["hello world", "second message"]);
    expect(cache.get("1")).toBe(cachedFirst);
    expect(cache.get("2")).toBe(cachedSecond);
  });

  it("updates cache when message content changes and prunes stale entries", () => {
    const cache: MessageContentCache = new Map();
    const initial = createMessages([
      { id: "1", content: "Original" },
      { id: "2", content: "Keep" },
    ]);

    buildLowercaseContent(initial, cache);
    const updated = createMessages([
      { id: "1", content: "Changed" },
      { id: "3", content: "New" },
    ]);

    const normalized = buildLowercaseContent(updated, cache);
    expect(normalized).toEqual(["changed", "new"]);

    expect(cache.get("1")).toMatchObject({
      original: "Changed",
      lower: "changed",
    });
    expect(cache.has("2")).toBe(false);
    expect(cache.get("3")).toMatchObject({ original: "New", lower: "new" });
  });

  it("clears cache when there are no messages", () => {
    const cache: MessageContentCache = new Map();
    const messages = createMessages([{ id: "1", content: "Sample" }]);
    buildLowercaseContent(messages, cache);
    expect(cache.size).toBe(1);

    const normalizedEmpty = buildLowercaseContent([], cache);
    expect(normalizedEmpty).toEqual([]);
    expect(cache.size).toBe(0);
  });
});

describe("normalizeSearchQuery", () => {
  it("trims and lower-cases queries", () => {
    expect(normalizeSearchQuery("  Mixed Case \t")).toBe("mixed case");
  });

  it("returns empty string for whitespace input", () => {
    expect(normalizeSearchQuery("   ")).toBe("");
  });
});

describe("matchNormalizedMessages", () => {
  it("returns matching message indices", () => {
    const normalizedMessages = [
      "hello world",
      "another message",
      "worldly matters",
    ];
    const query = normalizeSearchQuery("WORLD");
    expect(matchNormalizedMessages(normalizedMessages, query)).toEqual([0, 2]);
  });

  it("returns empty array for empty query", () => {
    const normalizedMessages = ["hello world"];
    expect(matchNormalizedMessages(normalizedMessages, "")).toEqual([]);
  });
});

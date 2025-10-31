import { describe, expect, it } from "vitest";

import {
  buildLowercaseContent,
  buildUserLookup,
  buildChannelLookup,
  matchNormalizedMessages,
  normalizeSearchQuery,
  parseSearchQuery,
  type MessageContentCache,
  type ParsedSearchFilters,
} from "../../src/lib/features/chat/utils/chatSearch";
import type { Message } from "../../src/lib/features/chat/models/Message";

const createMessages = (
  entries: Array<{ id: string; content: string }>,
): Array<{ id: string; content: string }> => entries;

const createMessage = (
  overrides: Partial<Message> & { id: string },
): Message => {
  const timestamp = overrides.timestamp ?? "2024-01-01T12:00:00.000Z";
  return {
    id: overrides.id,
    chatId: overrides.chatId ?? "chat-1",
    senderId: overrides.senderId ?? "user-1",
    content: overrides.content ?? "",
    timestamp,
    timestampMs: overrides.timestampMs ?? Date.parse(timestamp),
    read: overrides.read ?? true,
    pinned: overrides.pinned,
    attachments: overrides.attachments,
    authorType: overrides.authorType,
  } as Message;
};

const runMatch = (
  messages: Message[],
  query: string,
  filters: ParsedSearchFilters = {},
) => {
  const cache: MessageContentCache = new Map();
  const normalized = buildLowercaseContent(messages, cache);
  return matchNormalizedMessages(normalized, normalizeSearchQuery(query), {
    filters,
    messages,
    cache,
  });
};

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

  it("omits pinned tokens from normalized text", () => {
    expect(normalizeSearchQuery("pinned:true Hello World")).toBe("hello world");
  });
});

describe("parseSearchQuery", () => {
  const userLookup = buildUserLookup([
    { id: "user-1", name: "Alice", tag: "#1234" },
    { id: "user-2", name: "Bob" },
  ]);
  const channelLookup = buildChannelLookup([
    { id: "channel-1", name: "general" },
  ]);
  const baseOptions = {
    lookups: { users: userLookup, channels: channelLookup },
  };

  it("extracts pinned true filter", () => {
    const parsed = parseSearchQuery("pinned:true keyword", baseOptions);
    expect(parsed.filters.pinned).toBe(true);
    expect(parsed.normalizedText).toBe("keyword");
    expect(parsed.errors).toHaveLength(0);
  });

  it("resolves from and mentions filters", () => {
    const parsed = parseSearchQuery(
      "from:@Alice mentions:<@user-2>",
      baseOptions,
    );
    expect(parsed.filters.from).toEqual(["user-1"]);
    expect(parsed.filters.mentions).toEqual(["user-2"]);
    expect(parsed.errors).toHaveLength(0);
  });

  it("accepts mention ids not in lookup", () => {
    const parsed = parseSearchQuery("mentions:<@ghost>", baseOptions);
    expect(parsed.filters.mentions).toEqual(["ghost"]);
    expect(parsed.errors).toHaveLength(0);
  });

  it("parses channel, author type, and has filters", () => {
    const parsed = parseSearchQuery(
      "has:link has:image in:#general authorType:bot",
      baseOptions,
    );
    expect(parsed.filters.has).toEqual(["link", "image"]);
    expect(parsed.filters.in).toEqual(["channel-1"]);
    expect(parsed.filters.authorType).toEqual(["bot"]);
    expect(parsed.errors).toHaveLength(0);
  });

  it("parses date bounds", () => {
    const parsed = parseSearchQuery(
      "after:2024-01-01 before:2024-02-01",
      baseOptions,
    );
    expect(parsed.filters.after).toBeDefined();
    expect(parsed.filters.before).toBeDefined();
    expect((parsed.filters.after ?? 0) < (parsed.filters.before ?? 0)).toBe(
      true,
    );
  });

  it("reports validation errors for invalid tokens", () => {
    const parsed = parseSearchQuery(
      "pinned:maybe has:unknown from:@Unknown",
      baseOptions,
    );
    expect(parsed.filters.pinned).toBeUndefined();
    expect(parsed.filters.has).toBeUndefined();
    expect(parsed.filters.from).toBeUndefined();
    expect(parsed.errors.length).toBe(3);
    expect(parsed.tokens.find((token) => token.key === "pinned")?.valid).toBe(
      false,
    );
  });
});

describe("matchNormalizedMessages", () => {
  it("returns matching message indices for text queries", () => {
    const messages = [
      createMessage({ id: "1", content: "Hello world" }),
      createMessage({ id: "2", content: "Another message" }),
      createMessage({ id: "3", content: "Worldly matters" }),
    ];
    expect(runMatch(messages, "WORLD")).toEqual([0, 2]);
  });

  it("filters by pinned flag", () => {
    const messages = [
      createMessage({ id: "1", content: "One", pinned: false }),
      createMessage({ id: "2", content: "Two", pinned: true }),
    ];
    expect(runMatch(messages, "", { pinned: true })).toEqual([1]);
  });

  it("filters by sender id", () => {
    const messages = [
      createMessage({ id: "1", senderId: "user-1", content: "Hello" }),
      createMessage({ id: "2", senderId: "user-2", content: "Hi" }),
    ];
    expect(runMatch(messages, "", { from: ["user-2"] })).toEqual([1]);
  });

  it("filters by mentions", () => {
    const messages = [
      createMessage({ id: "1", content: "Ping <@user-2>" }),
      createMessage({ id: "2", content: "No mentions here" }),
    ];
    expect(runMatch(messages, "", { mentions: ["user-2"] })).toEqual([0]);
  });

  it("filters by link and attachment types", () => {
    const messages = [
      createMessage({ id: "1", content: "See https://example.com" }),
      createMessage({
        id: "2",
        content: "Photo",
        attachments: [
          {
            id: "att-1",
            name: "photo.png",
            type: "image/png",
            isLoaded: true,
            isLoading: false,
          },
        ],
      }),
    ];
    expect(runMatch(messages, "", { has: ["link"] })).toEqual([0]);
    expect(runMatch(messages, "", { has: ["image"] })).toEqual([1]);
  });

  it("filters by channel id", () => {
    const messages = [
      createMessage({ id: "1", chatId: "chat-1", content: "One" }),
      createMessage({ id: "2", chatId: "chat-2", content: "Two" }),
    ];
    expect(runMatch(messages, "", { in: ["chat-2"] })).toEqual([1]);
  });

  it("filters by author type", () => {
    const messages = [
      createMessage({ id: "1", content: "User message" }),
      createMessage({ id: "2", content: "Bot reply", authorType: "bot" }),
    ];
    expect(runMatch(messages, "", { authorType: ["bot"] })).toEqual([1]);
  });

  it("applies date bounds", () => {
    const messages = [
      createMessage({ id: "1", timestamp: "2024-01-01T12:00:00.000Z" }),
      createMessage({ id: "2", timestamp: "2024-02-10T12:00:00.000Z" }),
      createMessage({ id: "3", timestamp: "2024-03-05T12:00:00.000Z" }),
    ];
    const after = Date.parse("2024-01-15T00:00:00.000Z");
    const before = Date.parse("2024-03-01T00:00:00.000Z");
    expect(runMatch(messages, "", { after, before })).toEqual([1]);
  });
});

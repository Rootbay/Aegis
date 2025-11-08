import { describe, expect, it } from "vitest";

import { renderMessageContent } from "$lib/features/chat/utils/renderMessageContent";

describe("renderMessageContent", () => {
  it("renders mention tokens using the provided resolver", () => {
    const segments = renderMessageContent("Hello <@123>!", {
      resolveMentionName: (id) => (id === "123" ? "Ada" : null),
    });

    expect(segments).toEqual([
      { type: "text", text: "Hello " },
      { type: "mention", id: "123", name: "Ada" },
      { type: "text", text: "!" },
    ]);
  });

  it("converts URLs into link segments and preserves trailing punctuation", () => {
    const segments = renderMessageContent("Visit https://example.com/docs.");

    expect(segments).toEqual([
      { type: "text", text: "Visit " },
      {
        type: "link",
        url: "https://example.com/docs",
        label: "https://example.com/docs",
      },
      { type: "text", text: "." },
    ]);
  });

  it("does not create links for unsafe protocols or scripts", () => {
    const segments = renderMessageContent(
      "javascript:alert(1) <script>alert(1)</script>",
    );

    expect(segments).toEqual([
      { type: "text", text: "javascript:alert(1) <script>alert(1)</script>" },
    ]);
  });

  it("parses channel and role mentions with dedicated segment types", () => {
    const segments = renderMessageContent(
      "Join <#chan-1> and ping <@&role-9>!",
      {
        resolveChannelName: (id) => (id === "chan-1" ? "general" : null),
        resolveRoleName: (id) => (id === "role-9" ? "Moderators" : null),
      },
    );

    expect(segments).toEqual([
      { type: "text", text: "Join " },
      { type: "channel", id: "chan-1", name: "general" },
      { type: "text", text: " and ping " },
      { type: "role", id: "role-9", name: "Moderators" },
      { type: "text", text: "!" },
    ]);
  });

  it("recognizes @everyone and @here as special mentions", () => {
    const segments = renderMessageContent("Hey @everyone and @here!", {
      resolveSpecialMentionName: (key) =>
        key === "here" ? "@here" : "@everyone",
    });

    expect(segments).toEqual([
      { type: "text", text: "Hey " },
      { type: "special", key: "everyone", name: "@everyone" },
      { type: "text", text: " and " },
      { type: "special", key: "here", name: "@here" },
      { type: "text", text: "!" },
    ]);
  });
});

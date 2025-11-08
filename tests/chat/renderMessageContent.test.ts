import { describe, expect, it } from "vitest";

import { renderMessageContent } from "$lib/features/chat/utils/renderMessageContent";

describe("renderMessageContent", () => {
  it("renders mention tokens using the provided resolver", () => {
    const segments = renderMessageContent("Hello <@123>!", {
      resolveMentionName: (id) => (id === "123" ? "Ada" : null),
    });

    expect(segments).toEqual([
      { type: "text", text: "Hello ", html: "Hello " },
      { type: "mention", id: "123", name: "Ada" },
      { type: "text", text: "!", html: "!" },
    ]);
  });

  it("converts URLs into link segments and preserves trailing punctuation", () => {
    const segments = renderMessageContent("Visit https://example.com/docs.");

    expect(segments).toEqual([
      { type: "text", text: "Visit ", html: "Visit " },
      {
        type: "link",
        url: "https://example.com/docs",
        label: "https://example.com/docs",
      },
      { type: "text", text: ".", html: "." },
    ]);
  });

  it("does not create links for unsafe protocols or scripts", () => {
    const segments = renderMessageContent(
      "javascript:alert(1) <script>alert(1)</script>",
    );

    expect(segments).toEqual([
      {
        type: "text",
        text: "javascript:alert(1) <script>alert(1)</script>",
        html: "javascript:alert(1) &lt;script&gt;alert(1)&lt;/script&gt;",
      },
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
      { type: "text", text: "Join ", html: "Join " },
      { type: "channel", id: "chan-1", name: "general" },
      { type: "text", text: " and ping ", html: " and ping " },
      { type: "role", id: "role-9", name: "Moderators" },
      { type: "text", text: "!", html: "!" },
    ]);
  });

  it("recognizes @everyone and @here as special mentions", () => {
    const segments = renderMessageContent("Hey @everyone and @here!", {
      resolveSpecialMentionName: (key) =>
        key === "here" ? "@here" : "@everyone",
    });

    expect(segments).toEqual([
      { type: "text", text: "Hey ", html: "Hey " },
      { type: "special", key: "everyone", name: "@everyone" },
      { type: "text", text: " and ", html: " and " },
      { type: "special", key: "here", name: "@here" },
      { type: "text", text: "!", html: "!" },
    ]);
  });

  it("applies markdown formatting within text segments", () => {
    const segments = renderMessageContent("**Bold** _italic_ and `code`");

    expect(segments).toEqual([
      {
        type: "text",
        text: "Bold italic and code",
        html: "<strong>Bold</strong> <em>italic</em> and <code>code</code>",
      },
    ]);
  });

  it("preserves markdown formatting around mentions", () => {
    const segments = renderMessageContent("**Hello <@42>** and _<#channel>_");

    expect(segments).toEqual([
      {
        type: "text",
        text: "Hello ",
        html: "<strong>Hello ",
      },
      { type: "mention", id: "42", name: "42" },
      {
        type: "text",
        text: " and ",
        html: "</strong> and <em>",
      },
      { type: "channel", id: "channel", name: "channel" },
      {
        type: "text",
        text: "",
        html: "</em>",
      },
    ]);
  });
});

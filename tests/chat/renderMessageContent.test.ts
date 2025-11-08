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
});

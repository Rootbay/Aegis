import { describe, expect, it } from "vitest";

import { renderMessageContent } from "$lib/features/chat/utils/renderMessageContent";

function segmentsToHtml(
  segments: ReturnType<typeof renderMessageContent>,
): string {
  return segments
    .map((segment) => {
      switch (segment.type) {
        case "text":
          return segment.html;
        case "mention":
          return `<span class="mention" data-mention-id="${segment.id}">@${segment.name}</span>`;
        case "channel":
          return `<span class="channel" data-channel-id="${segment.id}">#${segment.name}</span>`;
        case "role":
          return `<span class="role" data-role-id="${segment.id}">@${segment.name}</span>`;
        case "special":
          return `<span class="special" data-special-mention="${segment.key}">${segment.name}</span>`;
        case "link":
          return `<a class="link" href="${segment.url}">${segment.label}</a>`;
        default:
          return "";
      }
    })
    .join("");
}

describe("message rendering pipeline", () => {
  it("produces consistent HTML for markdown, mentions, and links", () => {
    const segments = renderMessageContent(
      "Hello **world** <@123>! Visit https://example.com/docs.\n\n```ts\nconst value = 42;\n```",
      {
        resolveMentionName: (id) => (id === "123" ? "Ada" : null),
      },
    );

    const html = segmentsToHtml(segments);

    expect(html).toMatchInlineSnapshot(
      `"Hello <strong>world</strong> <span class=\"mention\" data-mention-id=\"123\">@Ada</span>! Visit <a class=\"link\" href=\"https://example.com/docs\">https://example.com/docs</a>.<br /><br /><pre><code class=\"language-ts\">const value = 42;</code></pre>"`,
    );
  });
});

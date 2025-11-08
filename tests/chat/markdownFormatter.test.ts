import { describe, expect, it } from "vitest";

import { formatMarkdownToSafeHtml } from "$lib/features/chat/utils/markdown";

describe("formatMarkdownToSafeHtml", () => {
  it("converts emphasis, italics, and inline code", () => {
    const result = formatMarkdownToSafeHtml("**bold** _italic_ and `code`");

    expect(result).toBe(
      "<strong>bold</strong> <em>italic</em> and <code>code</code>",
    );
  });

  it("escapes dangerous HTML content", () => {
    const result = formatMarkdownToSafeHtml("<script>alert('xss')</script>");

    expect(result).toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("renders fenced code blocks with preserved newlines", () => {
    const source = "```js\nconst x = 1;\nconsole.log(x);\n```";
    const result = formatMarkdownToSafeHtml(source);

    expect(result).toBe(
      '<pre><code class="language-js">const x = 1;\nconsole.log(x);</code></pre>',
    );
  });
});

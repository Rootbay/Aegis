const AMPERSAND = /&/g;
const LESS_THAN = /</g;
const GREATER_THAN = />/g;
const DOUBLE_QUOTE = /"/g;
const SINGLE_QUOTE = /'/g;

const INLINE_CODE_PATTERN = /`([^`]+?)`/g;
const BOLD_PATTERN = /\*\*(.+?)\*\*/gs;
const BOLD_UNDERSCORE_PATTERN = /__(.+?)__/gs;
const ITALIC_UNDERSCORE_PATTERN = /_(?!_)([^_]+?)_/gs;
const ITALIC_ASTERISK_PATTERN = /\*(?!\*)([^*]+?)\*/gs;
const STRIKETHROUGH_PATTERN = /~~(.+?)~~/gs;
const CODE_BLOCK_PATTERN = /```([^\n\r]*)\r?\n([\s\S]*?)```/g;

const INLINE_PLACEHOLDER_PREFIX = "\u0002";
const INLINE_PLACEHOLDER_SUFFIX = "\u0003";

function escapeHtml(value: string): string {
  if (!value) {
    return "";
  }

  return value
    .replace(AMPERSAND, "&amp;")
    .replace(LESS_THAN, "&lt;")
    .replace(GREATER_THAN, "&gt;")
    .replace(DOUBLE_QUOTE, "&quot;")
    .replace(SINGLE_QUOTE, "&#39;");
}

function sanitizeLanguage(language: string | null | undefined): string {
  if (!language) {
    return "";
  }

  return language.replace(/[^0-9A-Za-z_-]+/g, "").trim();
}

function restoreInlineCodePlaceholders(
  value: string,
  replacements: string[],
): string {
  return value.replace(
    new RegExp(
      `${INLINE_PLACEHOLDER_PREFIX}(\\d+)${INLINE_PLACEHOLDER_SUFFIX}`,
      "g",
    ),
    (_, index) => replacements[Number(index)] ?? "",
  );
}

function applyInlineMarkdown(content: string): string {
  if (!content) {
    return "";
  }

  const escaped = escapeHtml(content.replace(/\r\n?/g, "\n"));
  const inlineReplacements: string[] = [];

  let withCode = escaped.replace(INLINE_CODE_PATTERN, (_, code) => {
    const index = inlineReplacements.push(`<code>${code}</code>`) - 1;
    return `${INLINE_PLACEHOLDER_PREFIX}${index}${INLINE_PLACEHOLDER_SUFFIX}`;
  });

  withCode = withCode
    .replace(BOLD_PATTERN, "<strong>$1</strong>")
    .replace(BOLD_UNDERSCORE_PATTERN, "<strong>$1</strong>")
    .replace(STRIKETHROUGH_PATTERN, "<del>$1</del>")
    .replace(ITALIC_UNDERSCORE_PATTERN, "<em>$1</em>")
    .replace(ITALIC_ASTERISK_PATTERN, "<em>$1</em>")
    .replace(/\n/g, "<br />");

  return restoreInlineCodePlaceholders(withCode, inlineReplacements);
}

function renderCodeBlock(language: string, code: string): string {
  const sanitizedLanguage = sanitizeLanguage(language);
  const normalized = code.replace(/\r\n?/g, "\n");
  const trimmed = normalized.replace(/\n$/, "");
  const escaped = escapeHtml(trimmed);
  const classAttribute = sanitizedLanguage
    ? ` class="language-${sanitizedLanguage}"`
    : "";

  return `<pre><code${classAttribute}>${escaped}</code></pre>`;
}

export function formatMarkdownToSafeHtml(content: string): string {
  if (!content) {
    return "";
  }

  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CODE_BLOCK_PATTERN.exec(content)) !== null) {
    const [token, language = "", code = ""] = match;
    const index = match.index;

    if (index > lastIndex) {
      result += applyInlineMarkdown(content.slice(lastIndex, index));
    }

    result += renderCodeBlock(language, code);
    lastIndex = index + token.length;
  }

  if (lastIndex < content.length) {
    result += applyInlineMarkdown(content.slice(lastIndex));
  }

  return result;
}

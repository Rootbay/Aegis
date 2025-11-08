import type { Friend } from "$lib/features/friends/models/Friend";

import { formatMarkdownToSafeHtml } from "$lib/features/chat/utils/markdown";

const TOKEN_PATTERN =
  /<@&([^>\s]+)>|<@([^>\s]+)>|<#([^>\s]+)>|@(everyone|here)\b|https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[),.;!?:]+$/;

const PLACEHOLDER_PREFIX = "\u0000";
const PLACEHOLDER_SUFFIX = "\u0001";

export type FormattedMessageSegment =
  | { type: "text"; text: string; html: string }
  | { type: "mention"; id: string; name: string }
  | { type: "channel"; id: string; name: string }
  | { type: "role"; id: string; name: string }
  | { type: "special"; key: "everyone" | "here"; name: string }
  | { type: "link"; url: string; label: string };

export interface RenderMessageContentOptions {
  resolveMentionName?: (id: string) => string | null | undefined;
  resolveChannelName?: (id: string) => string | null | undefined;
  resolveRoleName?: (id: string) => string | null | undefined;
  resolveSpecialMentionName?: (
    key: "everyone" | "here",
  ) => string | null | undefined;
}

function normalizeUrl(raw: string): string | null {
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

type RawSegment =
  | { kind: "text"; text: string }
  | Exclude<
      FormattedMessageSegment,
      { type: "text"; html: string; text: string }
    >;

function createPlaceholder(index: number): string {
  return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
}

function stripHtmlTags(value: string): string {
  if (!value) {
    return "";
  }

  const withNewlines = value.replace(/<br\s*\/>/gi, "\n");
  const withoutTags = withNewlines.replace(/<[^>]+>/g, "");

  return withoutTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function createTextSegment(html: string): FormattedMessageSegment | null {
  if (!html) {
    return null;
  }

  return {
    type: "text",
    html,
    text: stripHtmlTags(html),
  } as const;
}

export function renderMessageContent(
  content: string | null | undefined,
  options: RenderMessageContentOptions = {},
): FormattedMessageSegment[] {
  const text = content ?? "";

  if (!text) {
    return [];
  }

  const rawSegments: RawSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  function pushText(value: string) {
    if (!value) {
      return;
    }

    const last = rawSegments[rawSegments.length - 1];
    if (last?.kind === "text") {
      last.text += value;
    } else {
      rawSegments.push({ kind: "text", text: value });
    }
  }

  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    const [token, roleId, mentionId, channelId, specialKey] = match;
    const index = match.index;

    if (index > lastIndex) {
      pushText(text.slice(lastIndex, index));
    }

    if (roleId) {
      const id = roleId.trim();
      const resolved = options.resolveRoleName?.(id) ?? "";
      const name = resolved.trim().length > 0 ? resolved.trim() : id;
      rawSegments.push({ type: "role", id, name });
    } else if (mentionId) {
      const id = mentionId.trim();
      const resolved = options.resolveMentionName?.(id) ?? "";
      const name = resolved.trim().length > 0 ? resolved.trim() : id;
      rawSegments.push({ type: "mention", id, name });
    } else if (channelId) {
      const id = channelId.trim();
      const resolved = options.resolveChannelName?.(id) ?? "";
      const name = resolved.trim().length > 0 ? resolved.trim() : id;
      rawSegments.push({ type: "channel", id, name });
    } else if (specialKey) {
      const normalizedKey = (
        specialKey.trim().toLowerCase() === "here" ? "here" : "everyone"
      ) as "everyone" | "here";
      const resolved = options.resolveSpecialMentionName?.(normalizedKey) ?? "";
      const name =
        resolved.trim().length > 0
          ? resolved.trim()
          : `@${normalizedKey === "here" ? "here" : "everyone"}`;
      rawSegments.push({ type: "special", key: normalizedKey, name });
    } else {
      let rawUrl = token;
      const trailingMatch = rawUrl.match(TRAILING_PUNCTUATION);
      let trailing = "";
      if (trailingMatch?.index != null && trailingMatch[0].length > 0) {
        trailing = trailingMatch[0];
        rawUrl = rawUrl.slice(0, rawUrl.length - trailing.length);
      }

      const normalized = normalizeUrl(rawUrl);
      if (normalized) {
        rawSegments.push({ type: "link", url: normalized, label: rawUrl });
        if (trailing) {
          pushText(trailing);
        }
      } else {
        pushText(token);
      }
    }

    lastIndex = TOKEN_PATTERN.lastIndex;
  }

  if (lastIndex < text.length) {
    pushText(text.slice(lastIndex));
  }

  const placeholderSegments: Exclude<RawSegment, { kind: "text" }>[] = [];
  const markdownSource = rawSegments
    .map((segment) => {
      if (segment.kind === "text") {
        return segment.text;
      }

      const index = placeholderSegments.push(segment) - 1;
      return createPlaceholder(index);
    })
    .join("");

  const formattedHtml = formatMarkdownToSafeHtml(markdownSource);
  const placeholderPattern = new RegExp(
    `${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`,
    "g",
  );

  const segments: FormattedMessageSegment[] = [];
  let htmlIndex = 0;
  let placeholderMatch: RegExpExecArray | null;

  while ((placeholderMatch = placeholderPattern.exec(formattedHtml)) !== null) {
    const index = placeholderMatch.index;
    const htmlChunk = formattedHtml.slice(htmlIndex, index);
    const textSegment = createTextSegment(htmlChunk);
    if (textSegment) {
      segments.push(textSegment);
    }

    const placeholderIndex = Number(placeholderMatch[1]);
    const segment = placeholderSegments[placeholderIndex];
    if (segment) {
      segments.push(segment);
    }

    htmlIndex = index + placeholderMatch[0].length;
  }

  if (htmlIndex < formattedHtml.length) {
    const trailingSegment = createTextSegment(formattedHtml.slice(htmlIndex));
    if (trailingSegment) {
      segments.push(trailingSegment);
    }
  }

  return segments;
}

export function mapFriendsById(friends: Friend[]): Map<string, Friend> {
  return new Map(friends.map((friend) => [friend.id, friend]));
}

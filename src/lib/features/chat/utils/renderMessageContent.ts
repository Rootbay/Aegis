import type { Friend } from "$lib/features/friends/models/Friend";

const TOKEN_PATTERN = /<@([^>\s]+)>|https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[),.;!?:]+$/;

export type FormattedMessageSegment =
  | { type: "text"; text: string }
  | { type: "mention"; id: string; name: string }
  | { type: "link"; url: string; label: string };

export interface RenderMessageContentOptions {
  resolveMentionName?: (id: string) => string | null | undefined;
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

export function renderMessageContent(
  content: string | null | undefined,
  options: RenderMessageContentOptions = {},
): FormattedMessageSegment[] {
  const text = content ?? "";

  if (!text) {
    return [];
  }

  const segments: FormattedMessageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    const [token, mentionId] = match;
    const index = match.index;

    if (index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, index) });
    }

    if (token.startsWith("<@")) {
      const id = mentionId?.trim() ?? "";
      const resolved = options.resolveMentionName?.(id) ?? "";
      const name = resolved.trim().length > 0 ? resolved.trim() : id;
      segments.push({ type: "mention", id, name });
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
        segments.push({ type: "link", url: normalized, label: rawUrl });
        if (trailing) {
          segments.push({ type: "text", text: trailing });
        }
      } else {
        segments.push({ type: "text", text: token });
      }
    }

    lastIndex = TOKEN_PATTERN.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments;
}

export function mapFriendsById(friends: Friend[]): Map<string, Friend> {
  return new Map(friends.map((friend) => [friend.id, friend]));
}

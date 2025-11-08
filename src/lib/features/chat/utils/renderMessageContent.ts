import type { Friend } from "$lib/features/friends/models/Friend";

const TOKEN_PATTERN =
  /<@&([^>\s]+)>|<@([^>\s]+)>|<#([^>\s]+)>|@(everyone|here)\b|https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[),.;!?:]+$/;

export type FormattedMessageSegment =
  | { type: "text"; text: string }
  | { type: "mention"; id: string; name: string }
  | { type: "channel"; id: string; name: string }
  | { type: "role"; id: string; name: string }
  | { type: "special"; key: "everyone" | "here"; name: string }
  | { type: "link"; url: string; label: string };

export interface RenderMessageContentOptions {
  resolveMentionName?: (id: string) => string | null | undefined;
  resolveChannelName?: (id: string) => string | null | undefined;
  resolveRoleName?: (id: string) => string | null | undefined;
  resolveSpecialMentionName?: (key: "everyone" | "here") => string | null | undefined;
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
    const [token, roleId, mentionId, channelId, specialKey] = match;
    const index = match.index;

    if (index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, index) });
    }

    if (roleId) {
      const id = roleId.trim();
      const resolved = options.resolveRoleName?.(id) ?? "";
      const name = resolved.trim().length > 0 ? resolved.trim() : id;
      segments.push({ type: "role", id, name });
    } else if (mentionId) {
      const id = mentionId.trim();
      const resolved = options.resolveMentionName?.(id) ?? "";
      const name = resolved.trim().length > 0 ? resolved.trim() : id;
      segments.push({ type: "mention", id, name });
    } else if (channelId) {
      const id = channelId.trim();
      const resolved = options.resolveChannelName?.(id) ?? "";
      const name = resolved.trim().length > 0 ? resolved.trim() : id;
      segments.push({ type: "channel", id, name });
    } else if (specialKey) {
      const normalizedKey = (specialKey.trim().toLowerCase() === "here"
        ? "here"
        : "everyone") as "everyone" | "here";
      const resolved = options.resolveSpecialMentionName?.(normalizedKey) ?? "";
      const name =
        resolved.trim().length > 0
          ? resolved.trim()
          : `@${normalizedKey === "here" ? "here" : "everyone"}`;
      segments.push({ type: "special", key: normalizedKey, name });
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

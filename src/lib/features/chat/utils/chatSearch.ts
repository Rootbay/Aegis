import type { Message } from "../models/Message";

const BOOLEAN_TRUE_VALUES = new Set(["true", "yes", "1"]);
const BOOLEAN_FALSE_VALUES = new Set(["false", "no", "0"]);

export interface ParsedSearchFilters {
  pinned?: boolean;
}

export interface ParsedSearchQuery {
  normalizedText: string;
  filters: ParsedSearchFilters;
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const trimmed = query.trim();
  if (!trimmed) {
    return { normalizedText: "", filters: {} };
  }

  const parts = trimmed.split(/\s+/);
  const textParts: string[] = [];
  let pinned: boolean | undefined;

  for (const part of parts) {
    const colonIndex = part.indexOf(":");
    if (colonIndex > 0) {
      const key = part.slice(0, colonIndex).toLowerCase();
      const value = part.slice(colonIndex + 1).toLowerCase();
      if (key === "pinned") {
        if (BOOLEAN_TRUE_VALUES.has(value)) {
          pinned = true;
          continue;
        }
        if (BOOLEAN_FALSE_VALUES.has(value)) {
          pinned = false;
          continue;
        }
        if (value.trim() === "") {
          pinned = true;
          continue;
        }
      }
    }
    textParts.push(part);
  }

  const normalizedText = textParts.join(" ").trim().toLowerCase();

  return {
    normalizedText,
    filters: pinned === undefined ? {} : { pinned },
  };
}

export interface CachedMessageContent {
  original: string;
  lower: string;
}

export type MessageContentCache = Map<string, CachedMessageContent>;

export function buildLowercaseContent(
  messages: Pick<Message, "id" | "content">[],
  cache: MessageContentCache,
): string[] {
  if (!messages.length) {
    if (cache.size) {
      cache.clear();
    }
    return [];
  }

  const normalized = new Array<string>(messages.length);
  const activeIds = new Set<string>();

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    const id = message.id;
    activeIds.add(id);
    const original = message.content ?? "";
    const cached = cache.get(id);

    if (cached && cached.original === original) {
      normalized[i] = cached.lower;
      continue;
    }

    const lower = original.toLowerCase();
    normalized[i] = lower;
    cache.set(id, { original, lower });
  }

  for (const id of Array.from(cache.keys())) {
    if (!activeIds.has(id)) {
      cache.delete(id);
    }
  }

  return normalized;
}

export function normalizeSearchQuery(query: string): string {
  return parseSearchQuery(query).normalizedText;
}

export function matchNormalizedMessages(
  normalizedMessages: string[],
  normalizedQuery: string,
  options?: { pinned?: boolean; messages?: Pick<Message, "pinned">[] },
): number[] {
  const pinnedFilter = options?.pinned;
  const messages = options?.messages;

  if (!normalizedQuery) {
    if (pinnedFilter === undefined || !messages) {
      return [];
    }
    const pinnedMatches: number[] = [];
    for (let i = 0; i < messages.length; i += 1) {
      const message = messages[i];
      if (Boolean(message?.pinned) === pinnedFilter) {
        pinnedMatches.push(i);
      }
    }
    return pinnedMatches;
  }

  const matches: number[] = [];
  for (let i = 0; i < normalizedMessages.length; i += 1) {
    if (normalizedMessages[i].includes(normalizedQuery)) {
      matches.push(i);
    }
  }

  if (pinnedFilter === undefined || !messages) {
    return matches;
  }

  return matches.filter((index) => {
    const message = messages[index];
    return Boolean(message?.pinned) === pinnedFilter;
  });
}

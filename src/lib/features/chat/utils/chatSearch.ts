import type { Message } from "../models/Message";

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
  return query.trim().toLowerCase();
}

export function matchNormalizedMessages(
  normalizedMessages: string[],
  normalizedQuery: string,
): number[] {
  if (!normalizedQuery) {
    return [];
  }

  const matches: number[] = [];
  for (let i = 0; i < normalizedMessages.length; i += 1) {
    if (normalizedMessages[i].includes(normalizedQuery)) {
      matches.push(i);
    }
  }
  return matches;
}

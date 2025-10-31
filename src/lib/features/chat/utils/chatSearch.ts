import type { Message, MessageAuthorType } from "../models/Message";

const BOOLEAN_TRUE_VALUES = new Set(["true", "yes", "1"]);
const BOOLEAN_FALSE_VALUES = new Set(["false", "no", "0"]);

const URL_REGEX = /https?:\/\/[^\s<>"]+/gi;
const TRAILING_PUNCTUATION = /[),.;!?:]+$/;

export type SearchHasToken =
  | "link"
  | "image"
  | "video"
  | "file"
  | "sound"
  | "embed";

export const DEFAULT_HAS_TOKENS: SearchHasToken[] = [
  "link",
  "image",
  "video",
  "file",
  "sound",
  "embed",
];

export const DEFAULT_AUTHOR_TYPES: MessageAuthorType[] = [
  "user",
  "bot",
  "webhook",
];

export interface LookupUser {
  id: string;
  name?: string | null;
  tag?: string | null;
}

export interface LookupChannel {
  id: string;
  name?: string | null;
}

function addLookupEntry(
  map: Map<string, string>,
  key: string | null | undefined,
  id: string,
) {
  if (!key) {
    return;
  }
  if (!map.has(key)) {
    map.set(key, id);
  }
  const lowered = key.toLowerCase();
  if (!map.has(lowered)) {
    map.set(lowered, id);
  }
}

export function buildUserLookup(users: LookupUser[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const user of users) {
    const id = user.id;
    if (!id) {
      continue;
    }
    addLookupEntry(lookup, id, id);
    addLookupEntry(lookup, `@${id}`, id);

    const name = user.name?.trim();
    if (name) {
      addLookupEntry(lookup, name, id);
      addLookupEntry(lookup, name.toLowerCase(), id);
      addLookupEntry(lookup, `@${name}`, id);
      addLookupEntry(lookup, `@${name}`.toLowerCase(), id);
    }

    const tag = user.tag?.trim();
    if (name && tag) {
      const combined = `${name} ${tag}`;
      addLookupEntry(lookup, combined, id);
      addLookupEntry(lookup, combined.toLowerCase(), id);
      addLookupEntry(lookup, `@${combined}`, id);
      addLookupEntry(lookup, `@${combined}`.toLowerCase(), id);
      const condensed = `${name}${tag}`;
      addLookupEntry(lookup, condensed, id);
      addLookupEntry(lookup, condensed.toLowerCase(), id);
      addLookupEntry(lookup, `@${condensed}`, id);
      addLookupEntry(lookup, `@${condensed}`.toLowerCase(), id);
    }

    if (tag) {
      addLookupEntry(lookup, tag, id);
      addLookupEntry(lookup, tag.toLowerCase(), id);
    }
  }
  return lookup;
}

export function buildChannelLookup(
  channels: LookupChannel[],
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const channel of channels) {
    const id = channel.id;
    if (!id) {
      continue;
    }
    addLookupEntry(lookup, id, id);
    const name = channel.name?.trim();
    if (name) {
      addLookupEntry(lookup, name, id);
      addLookupEntry(lookup, name.toLowerCase(), id);
      addLookupEntry(lookup, `#${name}`, id);
      addLookupEntry(lookup, `#${name}`.toLowerCase(), id);
    }
  }
  return lookup;
}

function resolveFromLookup(
  lookup: Map<string, string> | undefined,
  value: string,
): string | null {
  if (!lookup) {
    return null;
  }
  const direct = lookup.get(value);
  if (direct) {
    return direct;
  }
  const lowered = value.toLowerCase();
  return lookup.get(lowered) ?? null;
}

function stripEnclosingQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && last === first) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function resolveUserValue(
  value: string,
  lookup: Map<string, string> | undefined,
  allowUnknownId: boolean,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const direct = resolveFromLookup(lookup, trimmed);
  if (direct) {
    return direct;
  }

  if (trimmed.startsWith("<@") && trimmed.endsWith(">")) {
    const inner = trimmed.slice(2, -1).trim();
    if (!inner) {
      return null;
    }
    const fromLookup = resolveFromLookup(lookup, inner);
    if (fromLookup) {
      return fromLookup;
    }
    return allowUnknownId ? inner : null;
  }

  if (trimmed.startsWith("@")) {
    const withoutAt = trimmed.slice(1).trim();
    if (!withoutAt) {
      return null;
    }
    const fromLookup = resolveFromLookup(lookup, withoutAt);
    if (fromLookup) {
      return fromLookup;
    }
  }

  if (allowUnknownId && /^[\w-]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function resolveChannelValue(
  value: string,
  lookup: Map<string, string> | undefined,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const direct = resolveFromLookup(lookup, trimmed);
  if (direct) {
    return direct;
  }
  if (trimmed.startsWith("<#") && trimmed.endsWith(">")) {
    const inner = trimmed.slice(2, -1).trim();
    if (!inner) {
      return null;
    }
    return resolveFromLookup(lookup, inner) ?? inner;
  }
  if (trimmed.startsWith("#")) {
    const withoutHash = trimmed.slice(1).trim();
    if (!withoutHash) {
      return null;
    }
    const fromLookup = resolveFromLookup(lookup, withoutHash);
    if (fromLookup) {
      return fromLookup;
    }
  }
  if (/^[\w-]+$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function parseDateInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfDay(ms: number): number {
  return startOfDay(ms) + 24 * 60 * 60 * 1000;
}
export interface ParsedSearchFilters {
  pinned?: boolean;
  from?: string[];
  mentions?: string[];
  has?: SearchHasToken[];
  before?: number;
  after?: number;
  in?: string[];
  authorType?: MessageAuthorType[];
}

export interface ParsedSearchToken {
  key: string;
  rawValue: string;
  resolvedValue?: string;
  valid: boolean;
  message?: string;
}

export interface SearchFilterError {
  key: string;
  value: string;
  message: string;
}

export interface ParseSearchOptions {
  lookups?: {
    users?: Map<string, string>;
    channels?: Map<string, string>;
  };
  allowedHas?: SearchHasToken[];
  allowedAuthorTypes?: MessageAuthorType[];
}

export interface ParsedSearchQuery {
  normalizedText: string;
  filters: ParsedSearchFilters;
  tokens: ParsedSearchToken[];
  errors: SearchFilterError[];
}

function recordToken(
  tokens: ParsedSearchToken[],
  errors: SearchFilterError[],
  key: string,
  rawValue: string,
  resolvedValue: string | undefined,
  valid: boolean,
  message?: string,
) {
  const token: ParsedSearchToken = {
    key,
    rawValue,
    resolvedValue,
    valid,
    message,
  };
  tokens.push(token);
  if (!valid && message) {
    errors.push({ key, value: rawValue, message });
  }
}

export function parseSearchQuery(
  query: string,
  options: ParseSearchOptions = {},
): ParsedSearchQuery {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      normalizedText: "",
      filters: {},
      tokens: [],
      errors: [],
    };
  }

  const allowedHas = new Set<SearchHasToken>(
    (options.allowedHas ?? DEFAULT_HAS_TOKENS).map(
      (value) => value.toLowerCase() as SearchHasToken,
    ),
  );
  const allowedAuthorTypes = new Set<MessageAuthorType>(
    (options.allowedAuthorTypes ?? DEFAULT_AUTHOR_TYPES).map(
      (value) => value.toLowerCase() as MessageAuthorType,
    ),
  );

  const userLookup = options.lookups?.users;
  const channelLookup = options.lookups?.channels;

  const parts = trimmed.split(/\s+/);
  const textParts: string[] = [];
  const fromValues = new Set<string>();
  const mentionValues = new Set<string>();
  const hasValues = new Set<SearchHasToken>();
  const channelValues = new Set<string>();
  const authorValues = new Set<MessageAuthorType>();
  const tokens: ParsedSearchToken[] = [];
  const errors: SearchFilterError[] = [];
  let pinned: boolean | undefined;
  let after: number | undefined;
  let before: number | undefined;

  for (const part of parts) {
    const colonIndex = part.indexOf(":");
    if (colonIndex <= 0) {
      textParts.push(part);
      continue;
    }

    const key = part.slice(0, colonIndex).toLowerCase();
    const rawValue = part.slice(colonIndex + 1);
    const strippedValue = stripEnclosingQuotes(rawValue);

    switch (key) {
      case "pinned": {
        const normalized = strippedValue.trim().toLowerCase();
        if (!normalized) {
          pinned = true;
          recordToken(tokens, errors, key, rawValue, "true", true);
          break;
        }
        if (BOOLEAN_TRUE_VALUES.has(normalized)) {
          pinned = true;
          recordToken(tokens, errors, key, rawValue, "true", true);
          break;
        }
        if (BOOLEAN_FALSE_VALUES.has(normalized)) {
          pinned = false;
          recordToken(tokens, errors, key, rawValue, "false", true);
          break;
        }
        const message = `Pinned filter expects true or false, received "${strippedValue}".`;
        recordToken(tokens, errors, key, rawValue, undefined, false, message);
        textParts.push(part);
        break;
      }
      case "from": {
        if (!strippedValue.trim()) {
          const message = "Select a member for the from filter.";
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
          break;
        }
        const resolved = resolveUserValue(strippedValue, userLookup, false);
        if (resolved) {
          fromValues.add(resolved);
          recordToken(tokens, errors, key, rawValue, resolved, true);
        } else {
          const message = `No member matches "${strippedValue}".`;
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
        }
        break;
      }
      case "mentions": {
        if (!strippedValue.trim()) {
          const message = "Select a member for the mentions filter.";
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
          break;
        }
        const resolved = resolveUserValue(strippedValue, userLookup, true);
        if (resolved) {
          mentionValues.add(resolved);
          recordToken(tokens, errors, key, rawValue, resolved, true);
        } else {
          const message = `No member matches "${strippedValue}".`;
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
        }
        break;
      }
      case "has": {
        const normalized = strippedValue.trim().toLowerCase() as SearchHasToken;
        if (!normalized) {
          const message = "Choose a message type for the has filter.";
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
          break;
        }
        if (allowedHas.has(normalized)) {
          hasValues.add(normalized);
          recordToken(tokens, errors, key, rawValue, normalized, true);
        } else {
          const message = `Unknown message type "${strippedValue}". Try one of: ${
            [...allowedHas].join(", ")
          }.`;
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
        }
        break;
      }
      case "before": {
        const parsed = parseDateInput(strippedValue);
        if (parsed === null) {
          const message = `Unable to parse date "${strippedValue}".`;
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
          break;
        }
        const bound = startOfDay(parsed);
        before = before === undefined ? bound : Math.min(before, bound);
        recordToken(tokens, errors, key, rawValue, new Date(bound).toISOString(), true);
        break;
      }
      case "after": {
        const parsed = parseDateInput(strippedValue);
        if (parsed === null) {
          const message = `Unable to parse date "${strippedValue}".`;
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
          break;
        }
        const bound = startOfDay(parsed);
        after = after === undefined ? bound : Math.max(after, bound);
        recordToken(tokens, errors, key, rawValue, new Date(bound).toISOString(), true);
        break;
      }
      case "during": {
        const parsed = parseDateInput(strippedValue);
        if (parsed === null) {
          const message = `Unable to parse date "${strippedValue}".`;
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
          break;
        }
        const start = startOfDay(parsed);
        const end = endOfDay(parsed);
        after = after === undefined ? start : Math.max(after, start);
        before = before === undefined ? end : Math.min(before, end);
        recordToken(
          tokens,
          errors,
          key,
          rawValue,
          `${new Date(start).toISOString()}..${new Date(end).toISOString()}`,
          true,
        );
        break;
      }
      case "in": {
        if (!strippedValue.trim()) {
          const message = "Provide a channel for the in filter.";
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
          break;
        }
        const resolved = resolveChannelValue(strippedValue, channelLookup);
        if (resolved) {
          channelValues.add(resolved);
          recordToken(tokens, errors, key, rawValue, resolved, true);
        } else {
          const message = `Channel "${strippedValue}" was not found.`;
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
        }
        break;
      }
      case "authortype": {
        const normalized = strippedValue.trim().toLowerCase() as MessageAuthorType;
        if (!normalized) {
          const message = "Author type must be user, bot, or webhook.";
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
          break;
        }
        if (allowedAuthorTypes.has(normalized)) {
          authorValues.add(normalized);
          recordToken(tokens, errors, key, rawValue, normalized, true);
        } else {
          const message = `Author type must be one of: ${
            [...allowedAuthorTypes].join(", ")
          }.`;
          recordToken(tokens, errors, key, rawValue, undefined, false, message);
          textParts.push(part);
        }
        break;
      }
      default: {
        textParts.push(part);
      }
    }
  }

  const filters: ParsedSearchFilters = {};
  if (pinned !== undefined) {
    filters.pinned = pinned;
  }
  if (fromValues.size) {
    filters.from = Array.from(fromValues);
  }
  if (mentionValues.size) {
    filters.mentions = Array.from(mentionValues);
  }
  if (hasValues.size) {
    filters.has = Array.from(hasValues);
  }
  if (channelValues.size) {
    filters.in = Array.from(channelValues);
  }
  if (authorValues.size) {
    filters.authorType = Array.from(authorValues);
  }
  if (after !== undefined) {
    filters.after = after;
  }
  if (before !== undefined) {
    filters.before = before;
  }

  const normalizedText = textParts.join(" ").trim().toLowerCase();

  return {
    normalizedText,
    filters,
    tokens,
    errors,
  };
}
export interface CachedMessageContent {
  original: string;
  lower: string;
  mentionIds: string[];
  links: string[];
}

export type MessageContentCache = Map<string, CachedMessageContent>;

const MENTION_PATTERN = /<@([^>\s]+)>/g;

function extractMentionIds(content: string): string[] {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = MENTION_PATTERN.exec(content))) {
    const id = match[1]?.trim();
    if (id) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}

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
    const mentionIds = extractMentionIds(original);
    const links = Array.from(new Set(extractLinks(original)));
    normalized[i] = lower;
    cache.set(id, { original, lower, mentionIds, links });
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

interface MessageSearchMatchOptions {
  filters?: ParsedSearchFilters;
  messages?: Array<
    Pick<
      Message,
      | "id"
      | "content"
      | "pinned"
      | "senderId"
      | "attachments"
      | "timestamp"
      | "timestampMs"
      | "chatId"
      | "authorType"
    >
  >;
  cache?: MessageContentCache;
  pinned?: boolean;
}

function collectHasCategories(
  message: Pick<Message, "attachments">,
  cacheEntry?: CachedMessageContent,
): Set<SearchHasToken> {
  const categories = new Set<SearchHasToken>();
  if (cacheEntry?.links?.length) {
    categories.add("link");
  }

  const attachments = message.attachments ?? [];
  let hasGenericFile = false;

  for (const attachment of attachments) {
    const type = attachment?.type?.toLowerCase() ?? "";
    if (!type) {
      hasGenericFile = true;
      continue;
    }
    if (type.startsWith("image/")) {
      categories.add("image");
      continue;
    }
    if (type.startsWith("video/")) {
      categories.add("video");
      continue;
    }
    if (type.startsWith("audio/") || type.startsWith("sound/")) {
      categories.add("sound");
      continue;
    }
    if (
      type.includes("embed") ||
      type.includes("oembed") ||
      type.includes("html")
    ) {
      categories.add("embed");
      continue;
    }
    hasGenericFile = true;
  }

  if (hasGenericFile) {
    categories.add("file");
  }

  return categories;
}

export function matchNormalizedMessages(
  normalizedMessages: string[],
  normalizedQuery: string,
  options: MessageSearchMatchOptions = {},
): number[] {
  const filters: ParsedSearchFilters = {
    ...options.filters,
  };
  if (filters.pinned === undefined && options.pinned !== undefined) {
    filters.pinned = options.pinned;
  }

  const pinnedFilter = filters.pinned;
  const requiredFrom = filters.from ? new Set(filters.from) : null;
  const requiredMentions = filters.mentions ? new Set(filters.mentions) : null;
  const requiredHas = filters.has ? new Set(filters.has) : null;
  const requiredChannels = filters.in ? new Set(filters.in) : null;
  const requiredAuthorTypes = filters.authorType
    ? new Set(filters.authorType.map((value) => value.toLowerCase()))
    : null;
  const requireAfter = filters.after;
  const requireBefore = filters.before;

  const hasQuery = normalizedQuery.trim().length > 0;
  const requiresMetadata =
    pinnedFilter !== undefined ||
    !!requiredFrom ||
    !!requiredMentions ||
    !!requiredHas ||
    !!requiredChannels ||
    !!requiredAuthorTypes ||
    requireAfter !== undefined ||
    requireBefore !== undefined;

  const messages = options.messages;
  if (requiresMetadata) {
    if (!messages || messages.length !== normalizedMessages.length) {
      return [];
    }
  }

  const cache = options.cache;
  const matches: number[] = [];

  for (let i = 0; i < normalizedMessages.length; i += 1) {
    if (hasQuery && !normalizedMessages[i].includes(normalizedQuery)) {
      continue;
    }

    if (!requiresMetadata) {
      matches.push(i);
      continue;
    }

    const message = messages![i];
    if (!message) {
      continue;
    }

    if (pinnedFilter !== undefined && Boolean(message.pinned) !== pinnedFilter) {
      continue;
    }

    if (requiredFrom && !requiredFrom.has(message.senderId)) {
      continue;
    }

    const cacheEntry = cache?.get(message.id);
    const mentionIds = cacheEntry?.mentionIds ?? extractMentionIds(message.content ?? "");

    if (requiredMentions) {
      const mentionSet = new Set(mentionIds);
      let missing = false;
      for (const required of requiredMentions) {
        if (!mentionSet.has(required)) {
          missing = true;
          break;
        }
      }
      if (missing) {
        continue;
      }
    }

    if (requiredHas) {
      const categories = collectHasCategories(message, cacheEntry);
      let missing = false;
      for (const required of requiredHas) {
        if (!categories.has(required)) {
          missing = true;
          break;
        }
      }
      if (missing) {
        continue;
      }
    }

    if (requiredChannels && !requiredChannels.has(message.chatId)) {
      continue;
    }

    if (requiredAuthorTypes) {
      const authorType = (message.authorType ?? "user").toLowerCase();
      if (!requiredAuthorTypes.has(authorType as MessageAuthorType)) {
        continue;
      }
    }

    if (requireAfter !== undefined || requireBefore !== undefined) {
      const timestampMs =
        message.timestampMs ?? Date.parse(message.timestamp ?? "");
      if (Number.isNaN(timestampMs)) {
        continue;
      }
      if (requireAfter !== undefined && timestampMs < requireAfter) {
        continue;
      }
      if (requireBefore !== undefined && timestampMs >= requireBefore) {
        continue;
      }
    }

    matches.push(i);
  }

  return matches;
}
function normalizeUrl(raw: string): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function extractLinks(content: string | null | undefined): string[] {
  if (!content) {
    return [];
  }

  const matches = content.match(URL_REGEX);
  if (!matches) {
    return [];
  }

  const links: string[] = [];
  for (const match of matches) {
    const cleaned = match.replace(TRAILING_PUNCTUATION, "");
    const normalized = normalizeUrl(cleaned);
    if (normalized) {
      links.push(normalized);
    }
  }

  return links;
}


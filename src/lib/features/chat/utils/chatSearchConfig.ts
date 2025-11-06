import type { User } from "../../auth/models/User";

export const filterDefinitions = [
  { key: "from", label: "from", hint: "user", valueType: "user" },
  { key: "mentions", label: "mentions", hint: "user", valueType: "user" },
  {
    key: "has",
    label: "has",
    hint: "link, embed or file",
    valueType: "messageType",
  },
  { key: "before", label: "before", hint: "specific date", valueType: "date" },
  { key: "during", label: "during", hint: "specific date", valueType: "date" },
  { key: "after", label: "after", hint: "specific date", valueType: "date" },
  { key: "in", label: "in", hint: "channel", valueType: "channel" },
  {
    key: "pinned",
    label: "pinned",
    hint: "true or false",
    valueType: "boolean",
  },
  {
    key: "authorType",
    label: "authorType",
    hint: "user, bot or webhook",
    valueType: "authorType",
  },
] as const;

export type FilterKey = (typeof filterDefinitions)[number]["key"];
export type FilterValueType = (typeof filterDefinitions)[number]["valueType"];

export interface FilterDefinition {
  key: FilterKey;
  label: string;
  hint: string;
  valueType: FilterValueType;
}

export interface SearchToken {
  key: FilterKey;
  value: string;
}

export const filterConfig: Record<FilterKey, FilterDefinition> =
  filterDefinitions.reduce<Record<FilterKey, FilterDefinition>>(
    (acc, def) => {
      acc[def.key] = def;
      return acc;
    },
    {} as Record<FilterKey, FilterDefinition>,
  );

export const filterKeySet = new Set<FilterKey>(
  filterDefinitions.map((definition) => definition.key),
);

export const messageTypeOptions = [
  { value: "link", label: "Link" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "file", label: "File" },
  { value: "sound", label: "Sound" },
  { value: "embed", label: "Embed" },
] as const;

export function parseQuery(query: string): {
  tokens: SearchToken[];
  freeText: string;
} {
  if (!query.trim()) {
    return { tokens: [], freeText: "" };
  }

  const words = query.split(/\s+/).filter(Boolean);
  const parsedTokens: SearchToken[] = [];
  const remainder: string[] = [];
  let currentToken: SearchToken | null = null;

  const pushCurrent = () => {
    if (currentToken) {
      parsedTokens.push(currentToken);
      currentToken = null;
    }
  };

  for (const word of words) {
    const colonIndex = word.indexOf(":");
    if (colonIndex !== -1) {
      const keyCandidate = word.slice(0, colonIndex).toLowerCase() as FilterKey;
      if (filterKeySet.has(keyCandidate)) {
        pushCurrent();
        const valuePart = word.slice(colonIndex + 1);
        currentToken = { key: keyCandidate, value: valuePart };
        continue;
      }
    }

    if (currentToken) {
      const nextValue: string = currentToken.value
        ? `${currentToken.value} ${word}`
        : word;
      currentToken = { ...currentToken, value: nextValue };
    } else {
      remainder.push(word);
    }
  }

  pushCurrent();
  return { tokens: parsedTokens, freeText: remainder.join(" ") };
}

export function buildQuery(tokens: SearchToken[], freeText: string): string {
  const parts: string[] = [];
  tokens.forEach((token) => {
    const trimmedValue = token.value.trim();
    parts.push(trimmedValue ? `${token.key}:${trimmedValue}` : `${token.key}:`);
  });

  const trimmedFreeText = freeText.trim();
  if (trimmedFreeText) {
    parts.push(trimmedFreeText);
  }

  return parts.join(" ");
}

export function createUserTokenValue(user: Pick<User, "name" | "tag">): string {
  const suffix = user.tag ? ` ${user.tag}` : "";
  return `@${user.name}${suffix}`.trim();
}

export function getSearchPlaceholder(token: SearchToken | null): string {
  if (!token) return "Search";

  const definition = filterConfig[token.key];
  switch (definition.valueType) {
    case "user":
      return "Search users...";
    case "messageType":
      return "Select message type...";
    case "date":
      return "YYYY-MM-DD";
    case "channel":
      return "Channel name...";
    case "boolean":
      return "true or false";
    case "authorType":
      return "user, bot or webhook";
    default:
      return "Value...";
  }
}

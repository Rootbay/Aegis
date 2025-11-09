import type { EmojiCategory, UnicodeEmojiEntry } from "./types";

export type { EmojiCategory } from "./types";

export type EmojiLoadResult = {
  categories: EmojiCategory[];
  usedFallback: boolean;
};

export const fallbackEmojiCategories: EmojiCategory[] = [
  {
    id: "smileys",
    label: "Smileys & Emotion",
    emojis: mapUnicode([
      "😀",
      "😁",
      "😂",
      "🤣",
      "😊",
      "😍",
      "🤔",
      "😭",
      "😡",
      "😴",
      "🤯",
      "😎",
    ]),
  },
  {
    id: "gestures",
    label: "People & Body",
    emojis: mapUnicode([
      "👍",
      "👎",
      "👏",
      "🙏",
      "🙌",
      "🤝",
      "👋",
      "👌",
      "🤌",
      "🤟",
      "🤘",
      "🫶",
    ]),
  },
  {
    id: "symbols",
    label: "Symbols",
    emojis: mapUnicode([
      "❤️",
      "💔",
      "🔥",
      "✨",
      "🎉",
      "⭐",
      "⚡",
      "✅",
      "❌",
      "💡",
      "🎯",
      "📌",
    ]),
  },
];

export async function loadEmojiData(): Promise<EmojiLoadResult> {
  try {
    const module = await import("./emoji-metadata.json");
    const rawCategories = module.default as unknown;

    if (!Array.isArray(rawCategories)) {
      throw new Error("Emoji metadata is not an array");
    }

    const sanitized = rawCategories
      .map((category) => sanitizeCategory(category))
      .filter(
        (category): category is EmojiCategory => category.emojis.length > 0,
      );

    if (sanitized.length === 0) {
      throw new Error("Emoji metadata contained no usable categories");
    }

    return { categories: sanitized, usedFallback: false };
  } catch (error) {
    console.warn(
      "Failed to load emoji metadata, falling back to defaults",
      error,
    );
    return { categories: fallbackEmojiCategories, usedFallback: true };
  }
}

function sanitizeCategory(candidate: unknown): EmojiCategory {
  if (!candidate || typeof candidate !== "object") {
    return {
      id: "unknown",
      label: "Other",
      emojis: [],
    };
  }

  const id =
    getStringProperty(candidate, "id") ||
    getStringProperty(candidate, "label") ||
    "category";
  const label = getStringProperty(candidate, "label") || id;
  const emojis = Array.isArray((candidate as any).emojis)
    ? mapUnicode(
        (candidate as any).emojis.filter(
          (emoji: unknown) =>
            typeof emoji === "string" && emoji.trim().length > 0,
        ),
      )
    : [];

  return {
    id,
    label,
    emojis,
  };
}

function getStringProperty(candidate: unknown, key: string): string | null {
  if (!candidate || typeof candidate !== "object") return null;
  const value = (candidate as Record<string, unknown>)[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
}

function mapUnicode(values: string[]): UnicodeEmojiEntry[] {
  return values.map((value) => ({ type: "unicode", value }));
}

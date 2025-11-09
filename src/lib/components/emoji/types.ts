export type UnicodeEmojiEntry = {
  type: "unicode";
  value: string;
  label?: string;
};

export type CustomEmojiEntry = {
  type: "custom";
  id: string;
  name: string;
  url: string;
  value: string;
  label?: string;
  animated?: boolean;
};

export type StickerEmojiEntry = {
  type: "sticker";
  id: string;
  name: string;
  url: string;
  value: string;
  label?: string;
  animated?: boolean;
  previewUrl?: string | null;
  format?: string | null;
};

export type EmojiEntry =
  | UnicodeEmojiEntry
  | CustomEmojiEntry
  | StickerEmojiEntry;

export type EmojiCategory = {
  id: string;
  label: string;
  emojis: EmojiEntry[];
};

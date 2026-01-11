import type { AttachmentMeta, MessageEmbed, MessageAuthorType } from "../../models/Message";
import type { BackendAttachment, BackendMessageEmbed } from "./types";

export const FALLBACK_PARTICIPANT_AVATAR = (id: string) =>
  "https://api.dicebear.com/8.x/bottts-neutral/svg?seed=" + id;

export const fallbackParticipantName = (id: string) =>
  id && id.length > 0 ? `User-${id.slice(0, 4)}` : "Unknown user";

export function ensureUint8Array(input?: number[] | Uint8Array | ArrayBuffer): Uint8Array | undefined {
  if (!input) return undefined;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input instanceof Uint8Array) return new Uint8Array(input);
  return Uint8Array.from(input);
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = bytes;
  if (buffer instanceof ArrayBuffer) {
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }
  const clone = bytes.slice();
  return clone.buffer;
}

export function toAttachmentMeta(attachment: BackendAttachment): AttachmentMeta {
  const mime = attachment.content_type ?? attachment.contentType ?? "application/octet-stream";
  const bytes = ensureUint8Array(attachment.data);
  let objectUrl: string | undefined;
  if (bytes && bytes.length > 0) {
    const blobSource = toArrayBuffer(bytes);
    objectUrl = URL.createObjectURL(new Blob([blobSource], { type: mime }));
  }

  return {
    id: attachment.id,
    name: attachment.name,
    type: mime,
    size: attachment.size ?? bytes?.length,
    objectUrl,
    isLoaded: Boolean(objectUrl),
    isLoading: false,
    loadError: undefined,
  };
}

export function mapAttachmentPayloads(attachments?: BackendAttachment[] | null): AttachmentMeta[] {
  if (!attachments || attachments.length === 0) return [];
  return attachments.map(toAttachmentMeta);
}

export function normalizeEmbedText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeEmbedUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function normalizeEmbedColor(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const clamped = Math.max(0, Math.min(0xffffff, Math.floor(value)));
    return `#${clamped.toString(16).padStart(6, "0")}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (/^0x[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed.slice(2)}`;
    if (/^#?[0-9a-f]{6}$/i.test(trimmed)) return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (/^#?[0-9a-f]{3}$/i.test(trimmed)) {
      const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
      const expanded = hex.split("").map((char) => `${char}${char}`).join("");
      return `#${expanded}`;
    }
  }
  return undefined;
}

export function isMeaningfulEmbed(embed: MessageEmbed): boolean {
  if (!embed) return false;
  if (embed.title || embed.description || embed.url || embed.thumbnailUrl || embed.imageUrl || embed.siteName) return true;
  const provider = embed.provider;
  if (!provider) return false;
  return Boolean(provider.name || provider.url || provider.iconUrl);
}

export function toMessageEmbed(embed: BackendMessageEmbed): MessageEmbed | null {
  const providerSource = embed.provider ?? null;
  const providerName = normalizeEmbedText(providerSource?.name) ?? normalizeEmbedText(embed.provider_name ?? embed.providerName);
  const providerUrl = normalizeEmbedUrl(providerSource?.url) ?? normalizeEmbedUrl(embed.provider_url ?? embed.providerUrl);
  const providerIconUrl = normalizeEmbedUrl(providerSource?.icon_url ?? providerSource?.iconUrl) ?? normalizeEmbedUrl(embed.provider_icon_url ?? embed.providerIconUrl);

  const normalized: MessageEmbed = {
    id: embed.id ?? undefined,
    type: normalizeEmbedText(embed.type),
    url: normalizeEmbedUrl(embed.url),
    title: normalizeEmbedText(embed.title),
    description: normalizeEmbedText(embed.description),
    siteName: normalizeEmbedText(embed.site_name ?? embed.siteName),
    accentColor: normalizeEmbedColor(embed.color),
    thumbnailUrl: normalizeEmbedUrl(embed.thumbnail_url ?? embed.thumbnailUrl),
    imageUrl: normalizeEmbedUrl(embed.image_url ?? embed.imageUrl),
    provider: providerName || providerUrl || providerIconUrl ? { name: providerName, url: providerUrl, iconUrl: providerIconUrl } : undefined,
  };

  return isMeaningfulEmbed(normalized) ? normalized : null;
}

export function mapBackendEmbeds(embeds?: BackendMessageEmbed[] | null): MessageEmbed[] {
  if (!embeds || embeds.length === 0) return [];
  return embeds.map((embed) => {
    try {
      return toMessageEmbed(embed);
    } catch (error) {
      console.warn("Failed to normalize message embed", { embed, error });
      return null;
    }
  }).filter((embed): embed is MessageEmbed => Boolean(embed));
}

export function normalizeReactions(reactions?: Record<string, string[] | null | undefined> | null): Record<string, string[]> | undefined {
  if (!reactions) return undefined;
  const normalized: Record<string, string[]> = {};
  for (const [emoji, users] of Object.entries(reactions)) {
    if (!users) continue;
    const filtered = users.filter((user): user is string => typeof user === "string");
    if (filtered.length === 0) continue;
    normalized[emoji] = Array.from(new Set(filtered));
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeTimestamp(value: string | number | Date | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return new Date(value).toISOString();
}

export function normalizeOptionalDate(value: string | number | Date | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

const AUTHOR_TYPE_VALUES: MessageAuthorType[] = ["user", "bot", "webhook"];
const AUTHOR_TYPE_LOOKUP = new Set<MessageAuthorType>(AUTHOR_TYPE_VALUES);

export function normalizeAuthorType(value: string | null | undefined): MessageAuthorType | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase() as MessageAuthorType;
  return AUTHOR_TYPE_LOOKUP.has(lower) ? lower : undefined;
}

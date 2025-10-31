import { browser } from "$app/environment";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { get } from "svelte/store";

import { settings } from "$lib/features/settings/stores/settings";

export interface LinkPreviewMetadata {
  url: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
  iconUrl?: string | null;
}

const URL_REGEX = /https?:\/\/[^\s<>"]+/gi;
const TRAILING_PUNCTUATION = /[),.;!?:]+$/;
const PREVIEW_STORE_NAME = "link-previews.json";

const memoryCache = new Map<string, LinkPreviewMetadata | null>();
const pendingRequests = new Map<string, Promise<LinkPreviewMetadata | null>>();
let storePromise: Promise<Store | null> | null = null;

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

async function getStore(): Promise<Store | null> {
  if (!browser) {
    return null;
  }

  if (!storePromise) {
    storePromise = Store.load(PREVIEW_STORE_NAME).catch((error) => {
      console.warn("[linkPreviews] Failed to load preview store", error);
      return null;
    });
  }

  return storePromise;
}

export function extractLinks(content: string | null | undefined): string[] {
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

export function extractFirstLink(
  content: string | null | undefined,
): string | null {
  const [first] = extractLinks(content);
  return first ?? null;
}

export async function getLinkPreviewMetadata(
  url: string,
): Promise<LinkPreviewMetadata | null> {
  if (!url) {
    return null;
  }

  if (!get(settings).enableLinkPreviews) {
    return null;
  }

  const normalized = normalizeUrl(url);
  if (!normalized) {
    return null;
  }

  if (memoryCache.has(normalized)) {
    return memoryCache.get(normalized) ?? null;
  }

  const store = await getStore();
  if (store) {
    try {
      const cached = await store.get<LinkPreviewMetadata | null>(normalized);
      if (cached) {
        memoryCache.set(normalized, cached);
        return cached;
      }
    } catch (error) {
      console.warn(
        `[linkPreviews] Failed to read cached preview for ${normalized}`,
        error,
      );
    }
  }

  const pending = pendingRequests.get(normalized);
  if (pending) {
    return pending;
  }

  const request = invoke<LinkPreviewMetadata | null>("resolve_link_preview", {
    url: normalized,
  })
    .then(async (result) => {
      if (result) {
        memoryCache.set(normalized, result);
        if (store) {
          try {
            await store.set(normalized, result);
            await store.save();
          } catch (error) {
            console.warn(
              `[linkPreviews] Failed to persist preview for ${normalized}`,
              error,
            );
          }
        }
      } else {
        memoryCache.set(normalized, null);
      }

      return result;
    })
    .catch((error) => {
      console.warn(
        `[linkPreviews] Failed to resolve preview for ${normalized}`,
        error,
      );
      memoryCache.set(normalized, null);
      return null;
    })
    .finally(() => {
      pendingRequests.delete(normalized);
    });

  pendingRequests.set(normalized, request);
  return request;
}

export function clearLinkPreviewCache() {
  memoryCache.clear();
  pendingRequests.clear();
  if (browser) {
    storePromise = null;
  }
}

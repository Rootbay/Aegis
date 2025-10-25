import { writable } from "svelte/store";
import { v4 as uuidv4 } from "uuid";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

export interface ToastStoreOptions {
  dedupeWindowMs?: number;
  maxDedupeCacheSize?: number;
  dedupeCache?: Map<string, number>;
}

export function createToastStore(options: ToastStoreOptions = {}) {
  const { subscribe, update } = writable<Toast[]>([]);

  const MAX_VISIBLE = 5;
  const {
    dedupeWindowMs: DEDUPE_WINDOW_MS = 2000,
    maxDedupeCacheSize: MAX_DEDUPE_CACHE_SIZE = 200,
    dedupeCache = new Map<string, number>(),
  } = options;
  const DEFAULT_DURATION: Record<ToastType, number> = {
    success: 2500,
    info: 3000,
    warning: 4000,
    error: 5000,
  };

  const queue: Toast[] = [];

  function pruneDedupeCache(now: number) {
    for (const [key, timestamp] of dedupeCache) {
      if (now - timestamp > DEDUPE_WINDOW_MS) {
        dedupeCache.delete(key);
      }
    }
  }

  function enforceCacheSize() {
    if (MAX_DEDUPE_CACHE_SIZE <= 0) {
      return;
    }

    while (dedupeCache.size > MAX_DEDUPE_CACHE_SIZE) {
      const oldestKey = dedupeCache.keys().next().value as string | undefined;
      if (oldestKey === undefined) {
        break;
      }
      dedupeCache.delete(oldestKey);
    }
  }

  function addToast(message: string, type: ToastType, duration?: number) {
    const now = Date.now();
    const key = `${type}:${message}`;
    pruneDedupeCache(now);
    const last = dedupeCache.get(key);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) {
      return "";
    }
    dedupeCache.set(key, now);
    enforceCacheSize();

    const id = uuidv4();
    const toast: Toast = {
      id,
      message,
      type,
      duration: duration ?? DEFAULT_DURATION[type] ?? 3000,
    };

    let inserted = false;
    update((active) => {
      if (active.length < MAX_VISIBLE) {
        inserted = true;
        return [...active, toast];
      }
      return active;
    });

    if (!inserted) {
      queue.push(toast);
    }

    return id;
  }

  function removeToast(id: string) {
    update((active) => {
      const next = active.filter((t) => t.id !== id);
      while (next.length < MAX_VISIBLE && queue.length > 0) {
        const t = queue.shift()!;
        next.push(t);
      }
      return next;
    });
  }

  function showErrorToast(message: string, duration?: number) {
    addToast(message, "error", duration);
  }

  return { subscribe, addToast, removeToast, showErrorToast };
}

export const toasts = createToastStore();

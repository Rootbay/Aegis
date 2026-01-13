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

class ToastStore {
  #active = $state<Toast[]>([]);
  #queue: Toast[] = [];
  #dedupeCache: Map<string, number>;
  
  readonly #MAX_VISIBLE = 5;
  readonly #DEDUPE_WINDOW_MS: number;
  readonly #MAX_DEDUPE_CACHE_SIZE: number;
  
  readonly #DEFAULT_DURATION: Record<ToastType, number> = {
    success: 2500,
    info: 3000,
    warning: 4000,
    error: 5000,
  };

  constructor(options: ToastStoreOptions = {}) {
    this.#DEDUPE_WINDOW_MS = options.dedupeWindowMs ?? 2000;
    this.#MAX_DEDUPE_CACHE_SIZE = options.maxDedupeCacheSize ?? 200;
    this.#dedupeCache = options.dedupeCache ?? new Map<string, number>();
  }

  get active() {
    return this.#active;
  }

  subscribe(run: (value: Toast[]) => void) {
    run(this.#active);
    return $effect.root(() => {
      $effect(() => {
        run(this.#active);
      });
    });
  }

  #pruneDedupeCache(now: number) {
    for (const [key, timestamp] of this.#dedupeCache) {
      if (now - timestamp > this.#DEDUPE_WINDOW_MS) {
        this.#dedupeCache.delete(key);
      }
    }
  }

  #enforceCacheSize() {
    if (this.#MAX_DEDUPE_CACHE_SIZE <= 0) return;

    while (this.#dedupeCache.size > this.#MAX_DEDUPE_CACHE_SIZE) {
      const oldestKey = this.#dedupeCache.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.#dedupeCache.delete(oldestKey);
    }
  }

  addToast(message: string, type: ToastType, duration?: number) {
    const now = Date.now();
    const key = `${type}:${message}`;
    this.#pruneDedupeCache(now);
    
    const last = this.#dedupeCache.get(key);
    if (last !== undefined && now - last < this.#DEDUPE_WINDOW_MS) {
      return "";
    }
    
    this.#dedupeCache.set(key, now);
    this.#enforceCacheSize();

    const id = uuidv4();
    const toast: Toast = {
      id,
      message,
      type,
      duration: duration ?? this.#DEFAULT_DURATION[type] ?? 3000,
    };

    if (this.#active.length < this.#MAX_VISIBLE) {
      this.#active.push(toast);
    } else {
      this.#queue.push(toast);
    }

    return id;
  }

  removeToast(id: string) {
    this.#active = this.#active.filter((t) => t.id !== id);
    
    while (this.#active.length < this.#MAX_VISIBLE && this.#queue.length > 0) {
      const t = this.#queue.shift()!;
      this.#active.push(t);
    }
  }

  showErrorToast(message: string, duration?: number) {
    this.addToast(message, "error", duration);
  }
}

export const toasts = new ToastStore();

import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  const MAX_VISIBLE = 5;
  const DEFAULT_DURATION: Record<ToastType, number> = {
    success: 2500,
    info: 3000,
    warning: 4000,
    error: 5000,
  };

  const queue: Toast[] = [];

  let lastToastAt: Record<string, number> = {};
  const DEDUPE_WINDOW_MS = 2000;

  function addToast(message: string, type: ToastType, duration?: number) {
    const now = Date.now();
    const key = `${type}:${message}`;
    const last = lastToastAt[key] || 0;
    if (now - last < DEDUPE_WINDOW_MS) {
      return '';
    }
    lastToastAt[key] = now;

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
    addToast(message, 'error', duration);
  }

  return { subscribe, addToast, removeToast, showErrorToast };
}

export const toasts = createToastStore();

import { get, type Readable } from "svelte/store";
import { persistentStore } from "$lib/stores/persistentStore";

export interface MutedCategoriesStore extends Readable<Set<string>> {
  mute: (categoryId: string) => void;
  unmute: (categoryId: string) => void;
  toggle: (categoryId: string) => void;
  isMuted: (categoryId: string) => boolean;
  setMuted: (categoryIds: Iterable<string>) => void;
  clear: () => void;
}

const STORAGE_KEY = "categories:muted";

function normalizeCategoryIds(ids: Iterable<string>): Set<string> {
  const normalized = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (trimmed.length === 0) continue;
    normalized.add(trimmed);
  }
  return normalized;
}

function createMutedCategoriesStore(): MutedCategoriesStore {
  const backing = persistentStore<string[]>(STORAGE_KEY, []);

  const updateBacking = (updater: (ids: Set<string>) => void) => {
    backing.update((ids = []) => {
      const set = normalizeCategoryIds(ids);
      updater(set);
      return Array.from(set);
    });
  };

  return {
    subscribe(run) {
      return backing.subscribe((ids = []) => run(normalizeCategoryIds(ids)));
    },
    mute(categoryId: string) {
      if (!categoryId) return;
      updateBacking((set) => {
        set.add(categoryId);
      });
    },
    unmute(categoryId: string) {
      if (!categoryId) return;
      updateBacking((set) => {
        set.delete(categoryId);
      });
    },
    toggle(categoryId: string) {
      if (!categoryId) return;
      const current = get(backing) ?? [];
      const set = normalizeCategoryIds(current);
      if (set.has(categoryId)) {
        set.delete(categoryId);
      } else {
        set.add(categoryId);
      }
      backing.set(Array.from(set));
    },
    isMuted(categoryId: string) {
      if (!categoryId) return false;
      const current = get(backing) ?? [];
      return normalizeCategoryIds(current).has(categoryId);
    },
    setMuted(categoryIds: Iterable<string>) {
      const normalized = normalizeCategoryIds(categoryIds);
      backing.set(Array.from(normalized));
    },
    clear() {
      backing.set([]);
    },
  };
}

export const mutedCategoriesStore = createMutedCategoriesStore();

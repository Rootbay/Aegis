import { get, type Readable } from "svelte/store";
import { persistentStore } from "$lib/stores/persistentStore";

export type CategoryNotificationLevel =
  | "all_messages"
  | "mentions_only"
  | "nothing";

interface CategoryNotificationPreferencesStore
  extends Readable<Map<string, CategoryNotificationLevel>> {
  setPreference: (categoryId: string, level: CategoryNotificationLevel) => void;
  getPreference: (categoryId: string) => CategoryNotificationLevel;
  clear: () => void;
}

const STORAGE_KEY = "categories:notification-preferences";
const DEFAULT_LEVEL: CategoryNotificationLevel = "all_messages";

type PersistedState = Record<string, CategoryNotificationLevel>;

function normalizeState(state: PersistedState | null | undefined) {
  const normalized = new Map<string, CategoryNotificationLevel>();
  if (!state) {
    return normalized;
  }
  for (const [key, value] of Object.entries(state)) {
    if (!key) continue;
    if (value === "all_messages" || value === "mentions_only" || value === "nothing") {
      normalized.set(key, value);
    }
  }
  return normalized;
}

function createCategoryNotificationPreferencesStore(): CategoryNotificationPreferencesStore {
  const backing = persistentStore<PersistedState>(STORAGE_KEY, {});

  return {
    subscribe(run, invalidate) {
      return backing.subscribe((state) => {
        run(normalizeState(state));
      }, invalidate);
    },
    setPreference(categoryId: string, level: CategoryNotificationLevel) {
      if (!categoryId) return;
      if (!level) return;
      backing.update((current = {}) => ({
        ...current,
        [categoryId]: level,
      }));
    },
    getPreference(categoryId: string) {
      if (!categoryId) {
        return DEFAULT_LEVEL;
      }
      const current = get(backing) ?? {};
      return (
        normalizeState(current).get(categoryId) ?? DEFAULT_LEVEL
      );
    },
    clear() {
      backing.set({});
    },
  };
}

export const categoryNotificationPreferencesStore =
  createCategoryNotificationPreferencesStore();

export { DEFAULT_LEVEL as DEFAULT_CATEGORY_NOTIFICATION_LEVEL };

import { get, type Readable } from "svelte/store";
import { persistentStore } from "$lib/stores/persistentStore";

interface IgnoredUsersStore extends Readable<Set<string>> {
  ignore: (userId: string) => void;
  unignore: (userId: string) => void;
  toggle: (userId: string) => void;
  isIgnored: (userId: string) => boolean;
  clear: () => void;
}

const STORAGE_KEY = "friends:ignored";

function createIgnoredUsersStore(): IgnoredUsersStore {
  const backing = persistentStore<string[]>(STORAGE_KEY, []);

  const deriveSet = (ids: string[]): Set<string> => {
    const normalized = ids.filter(
      (id) => typeof id === "string" && id.trim().length > 0,
    );
    return new Set(normalized);
  };

  return {
    subscribe(run, invalidate) {
      return backing.subscribe((ids) => run(deriveSet(ids)));
    },
    ignore(userId: string) {
      if (!userId) return;
      backing.update((ids) => {
        const next = new Set(ids ?? []);
        next.add(userId);
        return Array.from(next);
      });
    },
    unignore(userId: string) {
      if (!userId) return;
      backing.update((ids) => {
        const next = new Set(ids ?? []);
        next.delete(userId);
        return Array.from(next);
      });
    },
    toggle(userId: string) {
      if (!userId) return;
      const current = new Set(get(backing) ?? []);
      if (current.has(userId)) {
        current.delete(userId);
      } else {
        current.add(userId);
      }
      backing.set(Array.from(current));
    },
    isIgnored(userId: string) {
      if (!userId) return false;
      const ids = get(backing) ?? [];
      return ids.includes(userId);
    },
    clear() {
      backing.set([]);
    },
  };
}

export const ignoredUsersStore = createIgnoredUsersStore();

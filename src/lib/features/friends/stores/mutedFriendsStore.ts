import { get, type Readable } from "svelte/store";
import { persistentStore } from "$lib/stores/persistentStore";

interface MutedFriendsStore extends Readable<Set<string>> {
  mute: (friendId: string) => void;
  unmute: (friendId: string) => void;
  toggle: (friendId: string) => void;
  isMuted: (friendId: string) => boolean;
  clear: () => void;
}

const STORAGE_KEY = "friends:muted";

function createMutedFriendsStore(): MutedFriendsStore {
  const backing = persistentStore<string[]>(STORAGE_KEY, []);

  const deriveSet = (ids: string[]): Set<string> => {
    const normalized = ids.filter((id) => typeof id === "string" && id.trim().length > 0);
    return new Set(normalized);
  };

  return {
    subscribe(run, invalidate) {
      return backing.subscribe((ids) => run(deriveSet(ids)));
    },
    mute(friendId: string) {
      if (!friendId) return;
      backing.update((ids) => {
        const next = new Set(ids);
        next.add(friendId);
        return Array.from(next);
      });
    },
    unmute(friendId: string) {
      if (!friendId) return;
      backing.update((ids) => {
        const next = new Set(ids);
        next.delete(friendId);
        return Array.from(next);
      });
    },
    toggle(friendId: string) {
      if (!friendId) return;
      const current = get(backing) ?? [];
      const set = new Set(current);
      if (set.has(friendId)) {
        set.delete(friendId);
      } else {
        set.add(friendId);
      }
      backing.set(Array.from(set));
    },
    isMuted(friendId: string) {
      if (!friendId) return false;
      const ids = get(backing) ?? [];
      return ids.includes(friendId);
    },
    clear() {
      backing.set([]);
    },
  };
}

export const mutedFriendsStore = createMutedFriendsStore();

import { get, type Readable } from "svelte/store";
import { persistentStore } from "$lib/stores/persistentStore";

export interface MutedChannelsStore extends Readable<Set<string>> {
  mute: (channelId: string) => void;
  unmute: (channelId: string) => void;
  toggle: (channelId: string) => void;
  isMuted: (channelId: string) => boolean;
  setMuted: (channelIds: Iterable<string>) => void;
  clear: () => void;
}

const STORAGE_KEY = "channels:muted";

function normalizeChannelIds(ids: Iterable<string>): Set<string> {
  const normalized = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string") {
      const trimmed = id.trim();
      if (trimmed.length > 0) {
        normalized.add(trimmed);
      }
    }
  }
  return normalized;
}

function createMutedChannelsStore(): MutedChannelsStore {
  const backing = persistentStore<string[]>(STORAGE_KEY, []);

  const updateBacking = (updater: (ids: Set<string>) => void) => {
    backing.update((ids) => {
      const set = normalizeChannelIds(ids ?? []);
      updater(set);
      return Array.from(set);
    });
  };

  return {
    subscribe(run) {
      return backing.subscribe((ids) => run(normalizeChannelIds(ids ?? [])));
    },
    mute(channelId: string) {
      if (!channelId) return;
      updateBacking((set) => {
        set.add(channelId);
      });
    },
    unmute(channelId: string) {
      if (!channelId) return;
      updateBacking((set) => {
        set.delete(channelId);
      });
    },
    toggle(channelId: string) {
      if (!channelId) return;
      const current = get(backing) ?? [];
      const set = normalizeChannelIds(current);
      if (set.has(channelId)) {
        set.delete(channelId);
      } else {
        set.add(channelId);
      }
      backing.set(Array.from(set));
    },
    isMuted(channelId: string) {
      if (!channelId) return false;
      const current = get(backing) ?? [];
      return normalizeChannelIds(current).has(channelId);
    },
    setMuted(channelIds: Iterable<string>) {
      const normalized = normalizeChannelIds(channelIds);
      backing.set(Array.from(normalized));
    },
    clear() {
      backing.set([]);
    },
  };
}

export const mutedChannelsStore = createMutedChannelsStore();

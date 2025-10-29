import { get, writable, type Readable } from "svelte/store";

export type MemberSidebarVisibilityState = Map<string, boolean>;

interface MemberSidebarVisibilityStore extends Readable<MemberSidebarVisibilityState> {
  setVisibility: (chatId: string, visible: boolean) => void;
  toggleVisibility: (chatId: string) => boolean;
  isVisible: (chatId: string) => boolean;
}

function createMemberSidebarVisibilityStore(): MemberSidebarVisibilityStore {
  const store = writable<MemberSidebarVisibilityState>(new Map());
  const { subscribe, update } = store;

  const setVisibility = (chatId: string, visible: boolean) => {
    update((state) => {
      const next = new Map(state);
      if (visible) {
        next.delete(chatId);
      } else {
        next.set(chatId, false);
      }
      return next;
    });
  };

  const toggleVisibility = (chatId: string) => {
    let nextVisible = true;
    update((state) => {
      const current = state.get(chatId);
      nextVisible = !(current ?? true);
      const next = new Map(state);
      if (nextVisible) {
        next.delete(chatId);
      } else {
        next.set(chatId, false);
      }
      return next;
    });
    return nextVisible;
  };

  const isVisible = (chatId: string) => {
    const state = get(store);
    const entry = state.get(chatId);
    return entry !== false;
  };

  return {
    subscribe,
    setVisibility,
    toggleVisibility,
    isVisible,
  };
}

export const memberSidebarVisibilityStore = createMemberSidebarVisibilityStore();

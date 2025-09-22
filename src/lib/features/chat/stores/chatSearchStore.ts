import { writable } from "svelte/store";

export interface ChatSearchState {
  open: boolean;
  query: string;
  matches: number[];
  activeMatchIndex: number;
}

interface ChatSearchHandlers {
  jumpToMatch?: (next: boolean) => void;
  clearSearch?: () => void;
}

const initialState: ChatSearchState = {
  open: false,
  query: "",
  matches: [],
  activeMatchIndex: 0,
};

function arraysEqual(a: number[], b: number[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function createChatSearchStore() {
  const { subscribe, set, update } = writable<ChatSearchState>(initialState);
  let handlers: ChatSearchHandlers = {};

  return {
    subscribe,
    open() {
      update((state) => (state.open ? state : { ...state, open: true }));
    },
    close() {
      update((state) => (state.open ? { ...state, open: false } : state));
    },
    reset() {
      update((state) => ({ ...state, ...initialState }));
    },
    setQuery(query: string) {
      update((state) => (state.query === query ? state : { ...state, query }));
    },
    setMatches(matches: number[]) {
      update((state) => {
        if (arraysEqual(state.matches, matches)) {
          const nextIndex = matches.length
            ? Math.min(state.activeMatchIndex, matches.length - 1)
            : 0;
          if (nextIndex === state.activeMatchIndex) {
            return state;
          }
          return { ...state, activeMatchIndex: nextIndex };
        }
        const nextIndex = matches.length
          ? Math.min(state.activeMatchIndex, matches.length - 1)
          : 0;
        return { ...state, matches, activeMatchIndex: nextIndex };
      });
    },
    setActiveMatchIndex(index: number) {
      update((state) => (state.activeMatchIndex === index ? state : { ...state, activeMatchIndex: index }));
    },
    registerHandlers(nextHandlers: ChatSearchHandlers) {
      handlers = nextHandlers;
      return () => {
        if (handlers === nextHandlers) {
          handlers = {};
        }
      };
    },
    jumpToMatch(next = true) {
      handlers.jumpToMatch?.(next);
    },
    clearSearch() {
      if (handlers.clearSearch) {
        handlers.clearSearch();
      } else {
        set(initialState);
      }
    },
  };
}

export const chatSearchStore = createChatSearchStore();
import { get, writable } from "svelte/store";

export interface ChatSearchState {
  open: boolean;
  query: string;
  matches: number[];
  activeMatchIndex: number;
  dropdownOpen: boolean;
  history: string[];
  searching: boolean;
}

interface ChatSearchHandlers {
  jumpToMatch?: (next: boolean) => void;
  clearSearch?: () => void;
  focusMatch?: (index: number) => void;
}

const BASE_STATE = {
  open: false,
  query: "",
  matches: [],
  activeMatchIndex: 0,
  dropdownOpen: false,
  searching: false,
} satisfies Omit<ChatSearchState, "history">;

const initialState: ChatSearchState = {
  ...BASE_STATE,
  history: [],
};

const MAX_HISTORY = 8;

function arraysEqual(a: number[], b: number[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function createChatSearchStore() {
  const store = writable<ChatSearchState>(initialState);
  const { subscribe, set, update } = store;
  let handlers: ChatSearchHandlers = {};

  return {
    subscribe,
    open() {
      update((state) => (state.open ? state : { ...state, open: true }));
    },
    close() {
      update((state) =>
        state.open ? { ...state, open: false, dropdownOpen: false } : state,
      );
    },
    reset() {
      update((state) => ({ ...state, ...BASE_STATE }));
    },
    setQuery(query: string) {
      update((state) => {
        if (state.query === query) {
          return state;
        }
        const trimmed = query.trim();
        return {
          ...state,
          query,
          searching: trimmed.length > 0 ? state.searching : false,
        };
      });
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
      update((state) =>
        state.activeMatchIndex === index
          ? state
          : { ...state, activeMatchIndex: index },
      );
    },
    focusMatch(index: number) {
      const state = get(store);
      const { matches } = state;
      if (!matches.length) {
        return;
      }
      const clampedIndex = Math.max(0, Math.min(index, matches.length - 1));
      if (state.activeMatchIndex !== clampedIndex) {
        set({ ...state, activeMatchIndex: clampedIndex });
      }
      handlers.focusMatch?.(clampedIndex);
    },
    setDropdownOpen(open: boolean) {
      update((state) =>
        state.dropdownOpen === open ? state : { ...state, dropdownOpen: open },
      );
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
        update((state) => ({ ...state, ...BASE_STATE }));
      }
    },
    executeSearch() {
      update((state) => {
        const trimmed = state.query.trim();
        if (!trimmed.length) {
          return { ...state, searching: false };
        }
        const nextHistory = [
          trimmed,
          ...state.history.filter((entry) => entry !== trimmed),
        ].slice(0, MAX_HISTORY);
        return {
          ...state,
          searching: true,
          history: nextHistory,
          dropdownOpen: false,
        };
      });
    },
    clearHistory() {
      update((state) =>
        state.history.length ? { ...state, history: [] } : state,
      );
    },
  };
}

export const chatSearchStore = createChatSearchStore();

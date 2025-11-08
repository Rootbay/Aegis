import { get, writable } from "svelte/store";

export interface ChatSearchState {
  open: boolean;
  query: string;
  matches: number[];
  activeMatchIndex: number;
  dropdownOpen: boolean;
  mobileResultsOpen: boolean;
  history: string[];
  searching: boolean;
  loading: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  searchRequestId: number;
  pagesLoaded: number;
  resultsReceived: number;
  loadMoreRequests: number;
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
  mobileResultsOpen: false,
  searching: false,
  loading: false,
  hasMore: false,
  nextCursor: null,
  searchRequestId: 0,
  pagesLoaded: 0,
  resultsReceived: 0,
  loadMoreRequests: 0,
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
      set(initialState);
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
          loading:
            trimmed.length > 0 && state.searching ? state.loading : false,
          hasMore: trimmed.length > 0 ? state.hasMore : false,
          nextCursor: trimmed.length > 0 ? state.nextCursor : null,
          pagesLoaded: trimmed.length > 0 ? state.pagesLoaded : 0,
          resultsReceived: trimmed.length > 0 ? state.resultsReceived : 0,
          loadMoreRequests: trimmed.length > 0 ? state.loadMoreRequests : 0,
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
    setMobileResultsOpen(open: boolean) {
      update((state) =>
        state.mobileResultsOpen === open
          ? state
          : { ...state, mobileResultsOpen: open },
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
          return {
            ...state,
            searching: false,
            loading: false,
            hasMore: false,
            nextCursor: null,
          };
        }
        const nextHistory = [
          trimmed,
          ...state.history.filter((entry) => entry !== trimmed),
        ].slice(0, MAX_HISTORY);
        const nextRequestId = state.searchRequestId + 1;
        return {
          ...state,
          searching: true,
          loading: true,
          history: nextHistory,
          dropdownOpen: false,
          hasMore: true,
          nextCursor: null,
          searchRequestId: nextRequestId,
          pagesLoaded: 0,
          resultsReceived: 0,
          loadMoreRequests: 0,
        };
      });
    },
    clearHistory() {
      update((state) =>
        state.history.length ? { ...state, history: [] } : state,
      );
    },
    setSearchLoading(requestId: number, loading: boolean) {
      update((state) => {
        if (state.searchRequestId !== requestId) {
          return state;
        }
        return state.loading === loading ? state : { ...state, loading };
      });
    },
    requestNextPage() {
      update((state) => {
        if (!state.searching || !state.hasMore || state.loading) {
          return state;
        }

        return {
          ...state,
          loadMoreRequests: state.loadMoreRequests + 1,
          loading: true,
        };
      });
    },
    recordSearchPage(
      requestId: number,
      page: { cursor: string | null; hasMore: boolean; results: number },
    ) {
      update((state) => {
        if (state.searchRequestId !== requestId) {
          return state;
        }
        const { cursor, hasMore, results } = page;
        return {
          ...state,
          nextCursor: cursor,
          hasMore,
          pagesLoaded: state.pagesLoaded + 1,
          resultsReceived:
            results > 0
              ? state.resultsReceived + results
              : state.resultsReceived,
        };
      });
    },
  };
}

export const chatSearchStore = createChatSearchStore();

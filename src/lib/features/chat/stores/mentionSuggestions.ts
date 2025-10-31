import { get, writable } from "svelte/store";

export interface MentionCandidate {
  id: string;
  name: string;
  avatar?: string;
  tag?: string;
}

export interface MentionSuggestionsState {
  active: boolean;
  query: string;
  triggerIndex: number;
  cursorIndex: number;
  suggestions: MentionCandidate[];
  activeIndex: number;
}

const initialState: MentionSuggestionsState = {
  active: false,
  query: "",
  triggerIndex: -1,
  cursorIndex: -1,
  suggestions: [],
  activeIndex: 0,
};

const MENTION_MATCH = /(^|[\s([{])@([^\s@]*)$/u;

function normalizeQuery(query: string) {
  return query.trim().toLowerCase();
}

function uniqueCandidates(candidates: MentionCandidate[]): MentionCandidate[] {
  const seen = new Set<string>();
  const unique: MentionCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate && !seen.has(candidate.id)) {
      seen.add(candidate.id);
      unique.push(candidate);
    }
  }
  return unique;
}

export function createMentionSuggestionsStore() {
  const store = writable<MentionSuggestionsState>(initialState);
  const { subscribe, set, update } = store;

  return {
    subscribe,
    updateInput(
      value: string,
      cursorPosition: number,
      members: MentionCandidate[],
    ) {
      if (!members.length) {
        set(initialState);
        return;
      }

      const textBeforeCursor = value.slice(0, cursorPosition);
      const match = textBeforeCursor.match(MENTION_MATCH);
      if (!match) {
        set(initialState);
        return;
      }

      const query = match[2] ?? "";
      const triggerIndex = cursorPosition - query.length - 1;
      const normalizedQuery = normalizeQuery(query);
      const uniqueMembers = uniqueCandidates(members);

      const suggestions = uniqueMembers.filter((member) => {
        if (!normalizedQuery) {
          return true;
        }
        const name = member.name?.toLowerCase?.() ?? "";
        const tag = member.tag?.toLowerCase?.() ?? "";
        return name.includes(normalizedQuery) || tag.includes(normalizedQuery);
      });

      if (!suggestions.length) {
        set(initialState);
        return;
      }

      set({
        active: true,
        query,
        triggerIndex,
        cursorIndex: cursorPosition,
        suggestions,
        activeIndex: 0,
      });
    },
    moveSelection(delta: number) {
      update((state) => {
        if (!state.active || !state.suggestions.length) {
          return state;
        }
        const count = state.suggestions.length;
        const nextIndex = (state.activeIndex + delta + count) % count;
        if (nextIndex === state.activeIndex) {
          return state;
        }
        return { ...state, activeIndex: nextIndex };
      });
    },
    setActiveIndex(index: number) {
      update((state) => {
        if (!state.active || !state.suggestions.length) {
          return state;
        }
        const nextIndex = Math.max(
          0,
          Math.min(index, state.suggestions.length - 1),
        );
        if (nextIndex === state.activeIndex) {
          return state;
        }
        return { ...state, activeIndex: nextIndex };
      });
    },
    select(index?: number) {
      const state = get(store);
      if (!state.active || !state.suggestions.length) {
        return null;
      }
      const targetIndex =
        typeof index === "number"
          ? Math.max(0, Math.min(index, state.suggestions.length - 1))
          : state.activeIndex;
      return state.suggestions[targetIndex];
    },
    close() {
      set(initialState);
    },
  };
}

export type MentionSuggestionsStore = ReturnType<
  typeof createMentionSuggestionsStore
>;

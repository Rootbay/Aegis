import { get, writable } from "svelte/store";

export type MentionCandidateKind = "user" | "channel" | "role" | "special";

export interface MentionCandidate {
  id: string;
  name: string;
  kind: MentionCandidateKind;
  avatar?: string;
  tag?: string;
  specialKey?: "everyone" | "here";
  searchText?: string;
}

export type MentionTrigger = "@" | "@&" | "#";

export interface MentionSuggestionsState {
  active: boolean;
  query: string;
  trigger: MentionTrigger | null;
  triggerIndex: number;
  cursorIndex: number;
  suggestions: MentionCandidate[];
  activeIndex: number;
}

const initialState: MentionSuggestionsState = {
  active: false,
  query: "",
  trigger: null,
  triggerIndex: -1,
  cursorIndex: -1,
  suggestions: [],
  activeIndex: 0,
};

const MENTION_MATCH = /(^|[\s([{])(@&|@|#)([^\s@#]*)$/u;

function normalizeQuery(query: string) {
  return query.trim().toLowerCase();
}

function uniqueCandidates(candidates: MentionCandidate[]): MentionCandidate[] {
  const seen = new Set<string>();
  const unique: MentionCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate ? `${candidate.kind}:${candidate.id}` : null;
    if (candidate && key && !seen.has(key)) {
      seen.add(key);
      unique.push(candidate);
    }
  }
  return unique;
}

function candidateSupportsTrigger(
  candidate: MentionCandidate,
  trigger: MentionTrigger,
): boolean {
  switch (candidate.kind) {
    case "channel":
      return trigger === "#";
    case "role":
      return trigger === "@&";
    case "special":
      return trigger === "@";
    case "user":
    default:
      return trigger === "@";
  }
}

export function createMentionSuggestionsStore() {
  const store = writable<MentionSuggestionsState>(initialState);
  const { subscribe, set, update } = store;

  return {
    subscribe,
    updateInput(
      value: string,
      cursorPosition: number,
      candidates: MentionCandidate[],
    ) {
      if (!candidates.length) {
        set(initialState);
        return;
      }

      const textBeforeCursor = value.slice(0, cursorPosition);
      const match = textBeforeCursor.match(MENTION_MATCH);
      if (!match) {
        set(initialState);
        return;
      }

      const trigger = (match[2] ?? "@") as MentionTrigger;
      const query = match[3] ?? "";
      const triggerOffset = trigger === "@&" ? 2 : 1;
      const triggerIndex = cursorPosition - query.length - triggerOffset;
      const normalizedQuery = normalizeQuery(query);
      const filteredCandidates = uniqueCandidates(
        candidates.filter((candidate) => candidateSupportsTrigger(candidate, trigger)),
      );

      const suggestions = filteredCandidates.filter((candidate) => {
        if (!normalizedQuery) {
          return true;
        }
        const name = candidate.name?.toLowerCase?.() ?? "";
        const searchText = candidate.searchText?.toLowerCase?.() ?? "";
        const tag = candidate.tag?.toLowerCase?.() ?? "";
        return (
          name.includes(normalizedQuery) ||
          tag.includes(normalizedQuery) ||
          (searchText && searchText.includes(normalizedQuery))
        );
      });

      if (!suggestions.length) {
        set(initialState);
        return;
      }

      set({
        active: true,
        query,
        trigger,
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

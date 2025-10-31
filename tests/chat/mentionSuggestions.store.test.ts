import { describe, expect, it } from "vitest";

import {
  createMentionSuggestionsStore,
  type MentionCandidate,
  type MentionSuggestionsState,
} from "$lib/features/chat/stores/mentionSuggestions";

function getState(store: ReturnType<typeof createMentionSuggestionsStore>) {
  let snapshot: MentionSuggestionsState = {
    active: false,
    query: "",
    triggerIndex: -1,
    cursorIndex: -1,
    suggestions: [],
    activeIndex: 0,
  };
  store.subscribe((value) => {
    snapshot = value;
  })();
  return snapshot;
}

describe("mentionSuggestions store", () => {
  const members: MentionCandidate[] = [
    { id: "user-naomi", name: "Naomi Naylor" },
    { id: "user-nate", name: "Nate North" },
    { id: "user-olivia", name: "Olivia Ost" },
  ];

  it("activates suggestions for partial mention query", () => {
    const store = createMentionSuggestionsStore();
    store.updateInput("Hello @na team", "Hello @na".length, members);
    const state = getState(store);
    expect(state.active).toBe(true);
    expect(state.suggestions.map((entry) => entry.id)).toContain("user-naomi");
    expect(state.triggerIndex).toBe("Hello ".length);
    expect(state.cursorIndex).toBe("Hello @na".length);
  });

  it("returns selected candidate when confirmed", () => {
    const store = createMentionSuggestionsStore();
    store.updateInput("@na", "@na".length, members);
    const selected = store.select();
    expect(selected?.id).toBe("user-naomi");
  });

  it("resets when no candidates match", () => {
    const store = createMentionSuggestionsStore();
    store.updateInput("Hello there", "Hello there".length, members);
    const state = getState(store);
    expect(state.active).toBe(false);
    expect(state.suggestions).toHaveLength(0);
  });
});

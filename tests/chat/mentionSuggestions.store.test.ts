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
    trigger: null,
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
    { id: "user-naomi", name: "Naomi Naylor", kind: "user" },
    { id: "user-nate", name: "Nate North", kind: "user" },
    { id: "user-olivia", name: "Olivia Ost", kind: "user" },
  ];

  it("activates suggestions for partial mention query", () => {
    const store = createMentionSuggestionsStore();
    store.updateInput("Hello @na team", "Hello @na".length, members);
    const state = getState(store);
    expect(state.active).toBe(true);
    expect(state.suggestions.map((entry) => entry.id)).toContain("user-naomi");
    expect(state.triggerIndex).toBe("Hello ".length);
    expect(state.trigger).toBe("@");
    expect(state.cursorIndex).toBe("Hello @na".length);
  });

  it("returns selected candidate when confirmed", () => {
    const store = createMentionSuggestionsStore();
    store.updateInput("@na", "@na".length, members);
    const selected = store.select();
    expect(selected?.id).toBe("user-naomi");
  });

  it("filters channel candidates when using the # trigger", () => {
    const store = createMentionSuggestionsStore();
    const candidates: MentionCandidate[] = [
      ...members,
      { id: "channel-general", name: "general", kind: "channel" },
      { id: "channel-random", name: "random", kind: "channel" },
    ];

    store.updateInput("Discuss in #gen", "Discuss in #gen".length, candidates);
    const state = getState(store);

    expect(state.active).toBe(true);
    expect(state.trigger).toBe("#");
    expect(state.suggestions.map((candidate) => candidate.id)).toEqual([
      "channel-general",
    ]);
  });

  it("surfaces special mentions when typing @everyone", () => {
    const store = createMentionSuggestionsStore();
    const candidates: MentionCandidate[] = [
      ...members,
      {
        id: "@everyone",
        name: "@everyone",
        kind: "special",
        specialKey: "everyone",
      },
      {
        id: "@here",
        name: "@here",
        kind: "special",
        specialKey: "here",
      },
    ];

    store.updateInput("Ping @every", "Ping @every".length, candidates);
    const state = getState(store);

    expect(state.active).toBe(true);
    expect(state.trigger).toBe("@");
    expect(state.suggestions.some((entry) => entry.id === "@everyone")).toBe(
      true,
    );
  });

  it("filters role candidates when using the @& trigger", () => {
    const store = createMentionSuggestionsStore();
    const candidates: MentionCandidate[] = [
      ...members,
      { id: "role-mods", name: "Moderators", kind: "role" },
      { id: "role-admin", name: "Admins", kind: "role" },
    ];

    store.updateInput(
      "Alert @&Adm",
      "Alert @&Adm".length,
      candidates,
    );
    const state = getState(store);

    expect(state.active).toBe(true);
    expect(state.trigger).toBe("@&");
    expect(state.suggestions.map((entry) => entry.id)).toEqual(["role-admin"]);
  });

  it("resets when no candidates match", () => {
    const store = createMentionSuggestionsStore();
    store.updateInput("Hello there", "Hello there".length, members);
    const state = getState(store);
    expect(state.active).toBe(false);
    expect(state.suggestions).toHaveLength(0);
  });
});

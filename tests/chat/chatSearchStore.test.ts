import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";

import { chatSearchStore } from "../../src/lib/features/chat/stores/chatSearchStore";

describe("chatSearchStore", () => {
  beforeEach(() => {
    chatSearchStore.reset();
  });

  it("executeSearch starts loading and records history", () => {
    chatSearchStore.setQuery("  hello world  ");
    chatSearchStore.executeSearch();

    const state = get(chatSearchStore);
    expect(state.searching).toBe(true);
    expect(state.loading).toBe(true);
    expect(state.history[0]).toBe("hello world");
    expect(state.searchRequestId).toBeGreaterThan(0);
    expect(state.pagesLoaded).toBe(0);
    expect(state.resultsReceived).toBe(0);
    expect(state.loadMoreRequests).toBe(0);
  });

  it("executeSearch with empty query clears searching state", () => {
    chatSearchStore.setQuery("   ");
    chatSearchStore.executeSearch();

    const state = get(chatSearchStore);
    expect(state.searching).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.history.length).toBe(0);
  });

  it("setSearchLoading respects the active request", () => {
    chatSearchStore.setQuery("example");
    chatSearchStore.executeSearch();
    const { searchRequestId } = get(chatSearchStore);

    chatSearchStore.setSearchLoading(searchRequestId, false);
    expect(get(chatSearchStore).loading).toBe(false);

    chatSearchStore.setSearchLoading(searchRequestId + 1, true);
    expect(get(chatSearchStore).loading).toBe(false);
  });

  it("requestNextPage increments the pending page counter when idle", () => {
    chatSearchStore.setQuery("more");
    chatSearchStore.executeSearch();
    const { searchRequestId } = get(chatSearchStore);

    chatSearchStore.setSearchLoading(searchRequestId, false);
    chatSearchStore.recordSearchPage(searchRequestId, {
      cursor: "cursor-1",
      hasMore: true,
      results: 2,
    });

    chatSearchStore.requestNextPage();

    const state = get(chatSearchStore);
    expect(state.loadMoreRequests).toBe(1);
    expect(state.loading).toBe(true);
  });

  it("recordSearchPage updates pagination counters for the active request", () => {
    chatSearchStore.setQuery("filters");
    chatSearchStore.executeSearch();
    const { searchRequestId } = get(chatSearchStore);

    chatSearchStore.recordSearchPage(searchRequestId, {
      cursor: "cursor-1",
      hasMore: true,
      results: 3,
    });

    let state = get(chatSearchStore);
    expect(state.pagesLoaded).toBe(1);
    expect(state.resultsReceived).toBe(3);
    expect(state.hasMore).toBe(true);
    expect(state.nextCursor).toBe("cursor-1");

    chatSearchStore.recordSearchPage(searchRequestId + 1, {
      cursor: "cursor-2",
      hasMore: false,
      results: 5,
    });

    state = get(chatSearchStore);
    expect(state.pagesLoaded).toBe(1);
    expect(state.resultsReceived).toBe(3);
    expect(state.nextCursor).toBe("cursor-1");
  });
});

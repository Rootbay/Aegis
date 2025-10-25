import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";

import { createFriendStore } from "../friendStore";
import type { Friend } from "$lib/features/friends/models/Friend";
import { userCache } from "$lib/utils/cache";

const baseFriend: Friend = {
  id: "friend-1",
  name: "Friend One",
  avatar: "https://example.com/avatar.png",
  online: false,
  status: "Offline",
  timestamp: new Date().toISOString(),
  messages: [],
};

describe("friendStore social event helpers", () => {
  beforeEach(() => {
    userCache.clear();
  });

  it("adds a pending friend when a request is received", () => {
    const store = createFriendStore();
    store.handleFriendsUpdate([]);

    store.addFriend({ id: "friend-request", relationshipStatus: "pending" });

    const state = get(store);
    expect(state.friends).toHaveLength(1);
    expect(state.friends[0].id).toBe("friend-request");
    expect(state.friends[0].status).toBe("Pending");
  });

  it("normalizes accepted friend responses", () => {
    const store = createFriendStore();
    store.handleFriendsUpdate([]);

    userCache.set(baseFriend.id, baseFriend);
    store.addFriend({
      id: baseFriend.id,
      relationshipStatus: "accepted",
    });

    const state = get(store);
    expect(state.friends).toHaveLength(1);
    expect(state.friends[0].id).toBe(baseFriend.id);
    expect(state.friends[0].relationshipStatus).toBe("accepted");
  });

  it("removes friends when a friendship is revoked", () => {
    const store = createFriendStore();
    store.handleFriendsUpdate([baseFriend]);

    store.removeFriend(baseFriend.id);

    const state = get(store);
    expect(state.friends).toHaveLength(0);
  });
});

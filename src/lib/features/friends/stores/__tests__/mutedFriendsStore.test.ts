import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";

import { mutedFriendsStore } from "../mutedFriendsStore";

describe("mutedFriendsStore", () => {
  beforeEach(() => {
    mutedFriendsStore.clear();
  });

  it("adds ids to the mute set", () => {
    mutedFriendsStore.mute("user-1");
    mutedFriendsStore.mute("user-2");

    const muted = get(mutedFriendsStore);
    expect(muted.has("user-1")).toBe(true);
    expect(muted.has("user-2")).toBe(true);
  });

  it("removes ids from the mute set", () => {
    mutedFriendsStore.mute("user-1");
    mutedFriendsStore.mute("user-2");

    mutedFriendsStore.unmute("user-1");

    const muted = get(mutedFriendsStore);
    expect(muted.has("user-1")).toBe(false);
    expect(muted.has("user-2")).toBe(true);
  });

  it("toggles mute state", () => {
    mutedFriendsStore.toggle("user-1");
    expect(mutedFriendsStore.isMuted("user-1")).toBe(true);

    mutedFriendsStore.toggle("user-1");
    expect(mutedFriendsStore.isMuted("user-1")).toBe(false);
  });
});

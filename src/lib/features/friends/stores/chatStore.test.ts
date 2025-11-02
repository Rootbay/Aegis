import { describe, beforeEach, it, expect, vi } from "vitest";
import { get } from "svelte/store";
import { createFriendStore } from "./friendStore";
import { userCache } from "$lib/utils/cache";

const { invokeMock, getInvokeMock, getUserSpy } = vi.hoisted(() => {
  const invoke = vi.fn();
  const getInvoke = vi.fn<() => Promise<typeof invoke | null>>();
  const getUser = vi.fn();
  return {
    invokeMock: invoke,
    getInvokeMock: getInvoke,
    getUserSpy: getUser,
  };
});

vi.mock("$services/tauri", () => ({
  getInvoke: () => getInvokeMock(),
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    subscribe: (run: (value: { me: { id: string } | null }) => void) => {
      run({ me: { id: "user-1" } });
      return () => {};
    },
    getUser: getUserSpy,
  },
}));

describe("friendStore.initialize", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    getInvokeMock.mockReset();
    getInvokeMock.mockResolvedValue(invokeMock);
    getUserSpy.mockReset();
    userCache.clear();
  });

  it("hydrates friendships from a single invoke and caches profiles", async () => {
    const payload = [
      {
        friendship: {
          id: "fs-1",
          user_a_id: "user-1",
          user_b_id: "friend-1",
          status: "accepted",
        },
        counterpart: {
          id: "friend-1",
          username: "Friend One",
          avatar: "https://example.com/a.png",
          is_online: true,
          public_key: "pub-1",
          bio: "Ready to chat",
          tag: "#0001",
        },
      },
      {
        friendship: {
          id: "fs-2",
          user_a_id: "friend-2",
          user_b_id: "user-1",
          status: "pending",
        },
        counterpart: {
          id: "friend-2",
          username: "",
          avatar: "",
          is_online: false,
          public_key: null,
          bio: null,
          tag: null,
        },
      },
    ];

    invokeMock.mockResolvedValueOnce(payload);

    const store = createFriendStore();
    await store.initialize();
    const state = get(store);

    expect(state.loading).toBe(false);
    expect(state.friends).toHaveLength(payload.length);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(getUserSpy).not.toHaveBeenCalled();
    expect(userCache.get("friend-1")).toMatchObject({ id: "friend-1" });
    expect(userCache.get("friend-2")).toMatchObject({ id: "friend-2" });
  });
});

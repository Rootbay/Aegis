import { describe, beforeEach, it, expect, vi } from "vitest";
import { get } from "svelte/store";
import { createFriendStore } from "./friendStore";
import { userCache } from "$lib/utils/cache";

const { invokeMock, getInvokeMock, getUserSpy, toastShowErrorMock } = vi.hoisted(
  () => {
    const invoke = vi.fn();
    const getInvoke = vi.fn<() => Promise<typeof invoke | null>>();
    const getUser = vi.fn();
    const toastShowError = vi.fn();
    return {
      invokeMock: invoke,
      getInvokeMock: getInvoke,
      getUserSpy: getUser,
      toastShowErrorMock: toastShowError,
    };
  },
);

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

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: vi.fn(),
    showErrorToast: (message: string) => toastShowErrorMock(message),
  },
}));

describe("friendStore.initialize", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    getInvokeMock.mockReset();
    getInvokeMock.mockResolvedValue(invokeMock);
    getUserSpy.mockReset();
    toastShowErrorMock.mockReset();
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

  it("retains existing friends when initialization fails", async () => {
    const existingFriend = {
      id: "friend-existing",
      name: "Existing Friend",
      avatar: "https://example.com/friend-existing.png",
      online: false,
      status: "Offline",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    getInvokeMock.mockResolvedValue(null);

    const store = createFriendStore();
    store.handleFriendsUpdate([existingFriend]);

    await store.initialize();

    const state = get(store);
    expect(state.loading).toBe(false);
    expect(state.friends).toHaveLength(1);
    expect(state.friends[0].id).toBe(existingFriend.id);
    expect(toastShowErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("backend is unavailable"),
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

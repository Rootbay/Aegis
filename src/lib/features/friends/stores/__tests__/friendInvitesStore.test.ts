import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { Friend } from "../../models/Friend";

vi.mock("$app/environment", () => ({
  browser: true,
}));

const listPendingFriendInvitesMock = vi.fn();
const listRecentFriendPeersMock = vi.fn();
const acceptFriendInviteMock = vi.fn();
const declineFriendInviteMock = vi.fn();
const sendFriendRequestMock = vi.fn();

const friendStoreAddFriendMock = vi.fn();
const toastAddMock = vi.fn();
let createFriendInvitesStore: typeof import("../friendInvitesStore").createFriendInvitesStore;

vi.mock("$lib/features/friends/services/friendDiscoveryService", () => ({
  listPendingFriendInvites: () => listPendingFriendInvitesMock(),
  listRecentFriendPeers: () => listRecentFriendPeersMock(),
  acceptFriendInvite: (value: unknown) => acceptFriendInviteMock(value),
  declineFriendInvite: (value: unknown) => declineFriendInviteMock(value),
  sendFriendRequest: (target: string, current?: string) =>
    sendFriendRequestMock(target, current),
  searchForUsers: vi.fn(),
}));

vi.mock("$lib/features/friends/stores/friendStore", () => ({
  friendStore: {
    addFriend: friendStoreAddFriendMock,
  },
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: toastAddMock,
  },
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    subscribe: (run: (value: { me: { id: string } | null }) => void) => {
      run({ me: { id: "user-1" } });
      return () => {};
    },
  },
}));

describe("friendInvitesStore", () => {
  beforeEach(async () => {
    const module = await import("../friendInvitesStore");
    createFriendInvitesStore = module.createFriendInvitesStore;
    listPendingFriendInvitesMock.mockReset();
    listRecentFriendPeersMock.mockReset();
    acceptFriendInviteMock.mockReset();
    declineFriendInviteMock.mockReset();
    sendFriendRequestMock.mockReset();
    friendStoreAddFriendMock.mockReset();
    toastAddMock.mockReset();
  });

  it("loads invites and peers during initialize", async () => {
    const invites = [
      {
        id: "invite-1",
        from: { id: "u-1", name: "Sender One", avatar: "", online: false },
        receivedAt: new Date().toISOString(),
      },
    ];
    const peers = [
      {
        id: "peer-1",
        user: { id: "u-2", name: "Peer Two", avatar: "", online: true },
        lastInteractionAt: new Date().toISOString(),
      },
    ];
    listPendingFriendInvitesMock.mockResolvedValueOnce(invites);
    listRecentFriendPeersMock.mockResolvedValueOnce(peers);

    const store = createFriendInvitesStore();
    await store.initialize();

    const state = get(store);
    expect(state.pendingInvites).toEqual(invites);
    expect(state.recentPeers).toEqual(peers);
    expect(listPendingFriendInvitesMock).toHaveBeenCalled();
    expect(listRecentFriendPeersMock).toHaveBeenCalled();
  });

  it("accepts invites and notifies friend store", async () => {
    const invite = {
      id: "invite-1",
      from: { id: "u-1", name: "Sender One", avatar: "", online: false },
      receivedAt: new Date().toISOString(),
    };
    listPendingFriendInvitesMock.mockResolvedValueOnce([invite]);
    listRecentFriendPeersMock.mockResolvedValueOnce([]);
    const acceptedFriend: Friend = {
      id: "u-1",
      name: "Sender One",
      avatar: "",
      online: false,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
      friendshipId: "friendship-1",
      relationshipStatus: "accepted",
    };
    acceptFriendInviteMock.mockResolvedValueOnce(acceptedFriend);

    const store = createFriendInvitesStore();
    await store.initialize();
    await store.acceptInvite(invite.id);

    const state = get(store);
    expect(state.pendingInvites).toHaveLength(0);
    expect(friendStoreAddFriendMock).toHaveBeenCalledWith(acceptedFriend);
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.stringContaining("You're now connected"),
      "success",
    );
  });

  it("declines invites and shows toast", async () => {
    const invite = {
      id: "invite-2",
      from: { id: "u-3", name: "Sender Two", avatar: "", online: false },
      receivedAt: new Date().toISOString(),
    };
    listPendingFriendInvitesMock.mockResolvedValueOnce([invite]);
    listRecentFriendPeersMock.mockResolvedValueOnce([]);
    declineFriendInviteMock.mockResolvedValueOnce(true);

    const store = createFriendInvitesStore();
    await store.initialize();
    const result = await store.declineInvite(invite.id);

    const state = get(store);
    expect(state.pendingInvites).toHaveLength(0);
    expect(result).toBe(true);
    expect(toastAddMock).toHaveBeenCalledWith("Invite dismissed.", "info");
  });

  it("sends friend requests and toggles toasts", async () => {
    sendFriendRequestMock.mockResolvedValueOnce(true);
    const store = createFriendInvitesStore();

    const success = await store.sendRequest("target-1 ");

    expect(success).toBe(true);
    expect(sendFriendRequestMock).toHaveBeenCalledWith("target-1", "user-1");
    expect(toastAddMock).toHaveBeenCalledWith("Friend request sent.", "success");
  });
});

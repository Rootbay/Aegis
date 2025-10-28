import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_GROUP_CONTEXT_KEY } from "../../src/lib/contextKeys";

const mocks = vi.hoisted(() => {
  const invoke = vi.fn(async (command: string) => {
    switch (command) {
      case "get_friendships":
        return [];
      case "send_friend_request":
        return null;
      case "remove_friendship":
        return null;
      case "send_server_invite":
        return { server_id: "server-1", user_id: "user-123", already_member: false };
      case "block_user":
      case "mute_user":
        return null;
      default:
        return null;
    }
  });

  const addToast = vi.fn();

  const openCreateGroupModal = vi.fn();
  const openReportUserModal = vi.fn();

  const currentChat = {
    id: "chat-789",
    type: "dm" as const,
    friend: {
      id: "user-123",
      name: "Alice",
      avatar: "https://example.com/alice.png",
      online: true,
      status: "Online" as const,
      timestamp: "2024-01-01T00:00:00.000Z",
      messages: [],
    },
    messages: [],
  };

  const createGroupContext = {
    currentChat,
    openCreateGroupModal,
    openReportUserModal,
    openUserCardModal: vi.fn(),
    openDetailedProfileModal: vi.fn(),
  };

  const userStoreValue = {
    me: {
      id: "current-user",
      name: "Current User",
      avatar: "https://example.com/me.png",
      online: true,
    },
    loading: false,
  };

  const userStoreMock = {
    subscribe(run: (value: typeof userStoreValue) => void) {
      run(userStoreValue);
      return () => {};
    },
    initialize: vi.fn(),
    toggleOnlineStatus: vi.fn(),
    updateProfile: vi.fn(),
    getUser: vi.fn(async (id: string) => ({
      id,
      name: `User ${id}`,
      avatar: "https://example.com/avatar.png",
      online: false,
    })),
    reset: vi.fn(),
  };

  const friendStoreValue = { friends: [], loading: false };
  const friendStoreMock = {
    subscribe(run: (value: typeof friendStoreValue) => void) {
      run(friendStoreValue);
      return () => {};
    },
    handleFriendsUpdate: vi.fn(),
    updateFriendPresence: vi.fn(),
    addFriend: vi.fn(),
    removeFriend: vi.fn(),
    initialize: vi.fn(),
  };

  const mutedFriendsStoreMock = {
    subscribe(run: (value: Set<string>) => void) {
      run(new Set());
      return () => {};
    },
    mute: vi.fn(),
    unmute: vi.fn(),
    toggle: vi.fn(),
    isMuted: vi.fn(() => false),
    clear: vi.fn(),
  };

  const serverStoreValue = {
    servers: [],
    loading: false,
    activeServerId: null,
    bansByServer: {},
  };
  const serverStoreMock = {
    subscribe(run: (value: typeof serverStoreValue) => void) {
      run(serverStoreValue);
      return () => {};
    },
    handleServersUpdate: vi.fn(),
    setActiveServer: vi.fn(),
    updateServerMemberPresence: vi.fn(),
    addServer: vi.fn(),
    removeServer: vi.fn(),
    fetchServerDetails: vi.fn(async () => {}),
    addChannelToServer: vi.fn(),
    addInviteToServer: vi.fn(),
    fetchBans: vi.fn(async () => []),
    unbanMember: vi.fn(async () => ({ success: true })),
    updateServer: vi.fn(async () => ({ success: true })),
    removeChannelFromServer: vi.fn(),
    initialize: vi.fn(),
    getServer: vi.fn(async () => null),
  };

  const chatStoreValue = { chats: [], activeChatId: null };
  const chatStoreMock = {
    subscribe(run: (value: typeof chatStoreValue) => void) {
      run(chatStoreValue);
      return () => {};
    },
    setActiveChat: vi.fn(async () => {}),
  };

  return {
    invoke,
    addToast,
    userStoreMock,
    friendStoreMock,
    mutedFriendsStoreMock,
    serverStoreMock,
    chatStoreMock,
    openCreateGroupModal,
    openReportUserModal,
    createGroupContext,
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: { addToast: mocks.addToast },
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: mocks.userStoreMock,
}));

vi.mock("$lib/features/friends/stores/friendStore", () => ({
  friendStore: mocks.friendStoreMock,
}));

vi.mock("$lib/features/friends/stores/mutedFriendsStore", () => ({
  mutedFriendsStore: mocks.mutedFriendsStoreMock,
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: mocks.serverStoreMock,
}));

vi.mock("$lib/features/chat/stores/chatStore", () => ({
  chatStore: mocks.chatStoreMock,
}));

vi.mock("$app/navigation", () => ({
  goto: vi.fn(async () => {}),
}));

vi.mock("$app/paths", () => ({
  resolve: vi.fn((path: string) => path),
}));

vi.mock("svelte", async () => {
  const actual = await vi.importActual<typeof import("svelte")>("svelte");
  const actualGetContext = actual.getContext;
  return {
    ...actual,
    getContext: vi.fn((key: unknown) =>
      key === CREATE_GROUP_CONTEXT_KEY
        ? mocks.createGroupContext
        : actualGetContext(key),
    ),
  };
});

import AppModals from "../../src/lib/layout/AppModals.svelte";
import UserCardModal from "../../src/lib/components/modals/UserCardModal.svelte";

describe("Detailed profile modal integration", () => {
  const profileUser = {
    id: "user-123",
    name: "Alice",
    avatar: "https://example.com/alice.png",
    bannerUrl: "https://example.com/banner.png",
    bio: "Cryptography enthusiast",
    online: true,
    tag: "@alice",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders DetailedProfileModal via AppModals and handles actions", async () => {
    const closeModal = vi.fn();

    const { getByLabelText, getByText, findByText, queryByText } = render(
      AppModals,
      {
        props: {
          activeModal: "detailedProfile",
          modalProps: {
            profileUser,
            mutualFriends: [],
            mutualServers: [],
            mutualGroups: [],
            isFriend: false,
            isMyProfile: false,
          },
          closeModal,
        },
      },
    );

    await findByText("Add Friend");

    await fireEvent.click(getByText("Add Friend"));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("send_friend_request", {
        current_user_id: "current-user",
        target_user_id: profileUser.id,
      });
      expect(mocks.addToast).toHaveBeenCalledWith("Friend request sent!", "success");
    });

    await fireEvent.click(getByText("Message"));

    await waitFor(() => {
      expect(mocks.chatStoreMock.setActiveChat).toHaveBeenCalledWith(
        profileUser.id,
        "dm",
      );
      expect(closeModal).toHaveBeenCalled();
    });

    await fireEvent.click(getByLabelText("More options"));
    expect(queryByText("View Reviews")).toBeNull();
    await fireEvent.click(getByText("Add to Group"));

    await waitFor(() => {
      expect(mocks.openCreateGroupModal).toHaveBeenCalledWith({
        preselectedUserIds: [profileUser.id],
        additionalUsers: [
          {
            id: profileUser.id,
            name: profileUser.name,
            avatar: profileUser.avatar,
            isFriend: false,
            isPinned: false,
          },
        ],
      });
    });

    await fireEvent.click(getByLabelText("More options"));
    await fireEvent.click(getByText("Report"));

    await waitFor(() => {
      expect(mocks.openReportUserModal).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUser: expect.objectContaining({
            id: profileUser.id,
            name: profileUser.name,
          }),
          sourceChatId: mocks.createGroupContext.currentChat.id,
          sourceChatType: "dm",
          sourceChatName:
            mocks.createGroupContext.currentChat.friend.name,
        }),
      );
    });

    await fireEvent.click(getByLabelText("Close"));

    expect(closeModal).toHaveBeenCalledTimes(2);
  });
});

describe("UserCardModal", () => {
  const profileUser = {
    id: "user-456",
    name: "Bob",
    avatar: "https://example.com/bob.png",
    bannerUrl: "https://example.com/banner.png",
    bio: "Operator",
    online: false,
    tag: "@bob",
  } as const;

  it("opens the detailed profile modal when requested", async () => {
    const openDetailedProfileModal = vi.fn();
    const close = vi.fn();

    const { getByLabelText } = render(UserCardModal, {
      props: {
        profileUser,
        openDetailedProfileModal,
        close,
      },
    });

    await fireEvent.click(getByLabelText("View profile picture"));

    expect(close).toHaveBeenCalled();
    expect(openDetailedProfileModal).toHaveBeenCalledWith(profileUser);
  });
});

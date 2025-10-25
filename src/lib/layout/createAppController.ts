import { goto } from "$app/navigation";
import { page } from "$app/stores";
import { onDestroy, onMount, setContext, untrack } from "svelte";
import {
  derived,
  get,
  writable,
  type Readable,
  type Unsubscriber,
} from "svelte/store";
import {
  authStore,
  type AuthState,
} from "$lib/features/auth/stores/authStore";
import { userStore } from "$lib/stores/userStore";
import { friendStore } from "$lib/features/friends/stores/friendStore";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import {
  activeChannelId,
  activeChatId,
  activeChatType,
  activeServerChannelId,
  chatStore,
  messagesByChatId,
} from "$lib/features/chat/stores/chatStore";
import {
  CREATE_GROUP_CONTEXT_KEY,
  FRIENDS_LAYOUT_DATA_CONTEXT_KEY,
} from "$lib/contextKeys";
import type { FriendsLayoutContext } from "$lib/contextTypes";
import { getListen } from "$services/tauri";
import type { AepMessage } from "$lib/features/chat/models/AepMessage";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { Server } from "$lib/features/servers/models/Server";
import type { Message } from "$lib/features/chat/models/Message";
import type { User } from "$lib/features/auth/models/User";
import type { Chat } from "$lib/features/chat/models/Chat";

export type AppModalType =
  | "createGroup"
  | "serverManagement"
  | "detailedProfile"
  | "userCard";

type ProfileModalSource = User & {
  bio?: string;
  pfpUrl?: string;
  bannerUrl?: string;
  isOnline?: boolean;
  publicKey?: string;
};

type PageState = {
  readonly friends: Friend[];
  readonly allUsers: Friend[];
  readonly currentChat: Chat | null;
  readonly openModal: (modalType: AppModalType, props?: Record<string, unknown>) => void;
  readonly closeModal: () => void;
  readonly openUserCardModal: (
    user: User,
    x: number,
    y: number,
    isServerMemberContext: boolean,
  ) => void;
  readonly openDetailedProfileModal: (user: User) => void;
  readonly messagesByChatId: typeof messagesByChatId;
};

type ModalState = {
  activeModal: Readable<AppModalType | null>;
  modalProps: Readable<Record<string, unknown>>;
};

type AppController = {
  authState: Readable<AuthState>;
  currentUser: Readable<User | null>;
  currentChat: Readable<Chat | null>;
  allUsers: Readable<Friend[]>;
  isAnySettingsPage: Readable<boolean>;
  isFriendsOrRootPage: Readable<boolean>;
  activeTab: Readable<string>;
  modal: ModalState;
  pageState: PageState;
  handlers: {
    handleKeydown: (event: KeyboardEvent) => void;
    handleFriendsTabSelect: (tab: string) => void;
    handleFriendsAddClick: () => void;
    handleSelectChannel: (serverId: string, channelId: string | null) => void;
    handleSelectDirectMessage: (chatId: string | null) => void;
    openModal: PageState["openModal"];
    closeModal: PageState["closeModal"];
    openDetailedProfileModal: PageState["openDetailedProfileModal"];
  };
};

const CARD_WIDTH = 300;
const CARD_HEIGHT = 410;
const CARD_MARGIN = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function withProfileDefaults(user: User): ProfileModalSource {
  const source = user as ProfileModalSource;
  return {
    ...user,
    bio: source.bio ?? "",
    pfpUrl: source.pfpUrl ?? user.avatar,
    bannerUrl: source.bannerUrl ?? "",
    isOnline: source.isOnline ?? user.online ?? false,
    publicKey: source.publicKey ?? "",
  };
}

function computeUserCardPosition(clickX: number, clickY: number) {
  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth : CARD_WIDTH + CARD_MARGIN * 2;
  const viewportHeight =
    typeof window !== "undefined" ? window.innerHeight : CARD_HEIGHT + CARD_MARGIN * 2;

  const safeX = Number.isFinite(clickX) ? clickX : viewportWidth - CARD_MARGIN;
  const safeY = Number.isFinite(clickY) ? clickY : viewportHeight - CARD_MARGIN;

  const x = clamp(
    safeX - CARD_WIDTH / 2,
    CARD_MARGIN,
    Math.max(CARD_MARGIN, viewportWidth - CARD_WIDTH - CARD_MARGIN),
  );

  let y = safeY - CARD_HEIGHT - CARD_MARGIN;
  const maxY = Math.max(CARD_MARGIN, viewportHeight - CARD_HEIGHT - CARD_MARGIN);

  if (y < CARD_MARGIN) {
    y = clamp(safeY + CARD_MARGIN, CARD_MARGIN, maxY);
  } else {
    y = Math.min(y, maxY);
  }

  return { x, y };
}

function toProfileModalUser(user: User) {
  const normalizedUser = withProfileDefaults(user);
  return {
    id: normalizedUser.id,
    name: normalizedUser.name ?? "Unknown User",
    bio: normalizedUser.bio,
    pfpUrl: normalizedUser.pfpUrl,
    bannerUrl: normalizedUser.bannerUrl,
    isOnline: normalizedUser.isOnline,
    publicKey: normalizedUser.publicKey,
  };
}

function navigateToUrl(url: URL) {
  const target = `${url.pathname}${url.search}`;
  // eslint-disable-next-line svelte/no-navigation-without-resolve
  goto(target);
}

export function createAppController(): AppController {
  const authState = writable<AuthState>(get(authStore));
  const currentUser = writable<User | null>(get(userStore).me ?? null);
  const activeModal = writable<AppModalType | null>(null);
  const modalProps = writable<Record<string, unknown>>({});
  const postAuthInitialized = writable(false);
  let unlistenHandlers: Array<() => void> = [];

  const clearUnlistenHandlers = () => {
    for (const handler of unlistenHandlers) {
      try {
        handler();
      } catch (error) {
        console.error("Failed to detach event listener:", error);
      }
    }
    unlistenHandlers = [];
  };

  const openModal: PageState["openModal"] = (modalType, props = {}) => {
    activeModal.set(modalType);
    modalProps.set(props);
  };

  const closeModal: PageState["closeModal"] = () => {
    activeModal.set(null);
    modalProps.set({});
  };

  const openUserCardModal: PageState["openUserCardModal"] = (
    user,
    x,
    y,
    isServerMemberContext,
  ) => {
    const normalizedUser = withProfileDefaults(user);
    const position = computeUserCardPosition(x, y);
    openModal("userCard", {
      profileUser: normalizedUser,
      x: position.x,
      y: position.y,
      isServerMemberContext,
      openDetailedProfileModal,
    });
  };

  const openDetailedProfileModal: PageState["openDetailedProfileModal"] = (user) => {
    const friends = get(friendStore).friends;
    openModal("detailedProfile", {
      profileUser: toProfileModalUser(user),
      isFriend: friends.some((friend) => friend.id === user.id),
    });
  };

  const handleFriendsTabSelect = (tab: string) => {
    const url = new URL(get(page).url);
    if (url.pathname === "/friends/add") {
      url.pathname = "/friends";
    }
    url.searchParams.set("tab", tab);
    navigateToUrl(url);
  };

  const handleFriendsAddClick = () => {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    goto("/friends/add");
  };

  const handleSelectChannel = (serverId: string, channelId: string | null) => {
    if (channelId) {
      chatStore.setActiveChat(serverId, "server", channelId);
    }
  };

  const handleSelectDirectMessage = (chatId: string | null) => {
    if (chatId) {
      chatStore.setActiveChat(chatId, "dm");
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closeModal();
    }
  };

  const bootstrapAfterAuthentication = async () => {
    const [serverResult, friendResult] = await Promise.allSettled([
      serverStore.initialize(),
      friendStore.initialize(),
    ] as const);

    if (serverResult.status === "rejected") {
      console.error(
        "Server store failed to initialize during post-auth bootstrap:",
        serverResult.reason,
      );
    }

    if (friendResult.status === "rejected") {
      console.error(
        "Friend store failed to initialize during post-auth bootstrap:",
        friendResult.reason,
      );
    }

    clearUnlistenHandlers();

    const storedActiveServerId = localStorage.getItem("activeServerId");
    const storedActiveChatId = localStorage.getItem("activeChatId");
    const storedActiveChatType = localStorage.getItem("activeChatType");

    if (storedActiveServerId) {
      serverStore.setActiveServer(storedActiveServerId);
    }
    if (storedActiveChatId && storedActiveChatType) {
      chatStore.setActiveChat(
        storedActiveChatId,
        storedActiveChatType as "dm" | "server",
      );
    }

    const listen = await getListen();
    if (listen) {
      const unlistenFriends = await listen<{ payload: Friend[] }>(
        "friends-updated",
        (event) => {
          friendStore.handleFriendsUpdate(event.payload);
        },
      );

      const unlistenServers = await listen<{ payload: Server[] }>(
        "servers-updated",
        (event) => {
          serverStore.handleServersUpdate(event.payload);
        },
      );

      const unlistenMessages = await listen<{
        payload: { chatId: string; messages: Message[] };
      }>("messages-updated", (event) => {
        const { chatId: chatIdValue, messages } = event.payload;
        chatStore.handleMessagesUpdate(chatIdValue, messages);
      });

      const unlistenPresence = await listen<{ payload: AepMessage }>(
        "new-message",
        (event) => {
          const receivedMessage: AepMessage = event.payload;
          if (receivedMessage.PresenceUpdate) {
            const { user_id, is_online } = receivedMessage.PresenceUpdate;
            friendStore.updateFriendPresence(user_id, is_online);
            serverStore.updateServerMemberPresence(user_id, is_online);
            return;
          }

          if (receivedMessage.ChatMessage) {
            chatStore.handleNewMessageEvent(receivedMessage.ChatMessage);
            return;
          }

          const currentUserId = get(userStore).me?.id;

          if (receivedMessage.FriendRequest && currentUserId) {
            const { sender_id, target_id } = receivedMessage.FriendRequest;
            if (sender_id === currentUserId || target_id === currentUserId) {
              const counterpartId =
                sender_id === currentUserId ? target_id : sender_id;
              if (counterpartId) {
                friendStore.addFriend({
                  id: counterpartId,
                  relationshipStatus: "pending",
                  status: "Pending",
                });
              }
            }
            return;
          }

          if (receivedMessage.FriendRequestResponse && currentUserId) {
            const { sender_id, target_id, accepted } =
              receivedMessage.FriendRequestResponse;
            if (sender_id === currentUserId || target_id === currentUserId) {
              const counterpartId =
                sender_id === currentUserId ? target_id : sender_id;
              if (!counterpartId) {
                return;
              }
              if (accepted) {
                friendStore.addFriend({
                  id: counterpartId,
                  relationshipStatus: "accepted",
                  status: "Offline",
                });
              } else {
                friendStore.removeFriend(counterpartId);
              }
            }
            return;
          }

          if (receivedMessage.BlockUser && currentUserId) {
            const { blocker_id, blocked_id } = receivedMessage.BlockUser;
            if (blocker_id === currentUserId) {
              friendStore.addFriend({
                id: blocked_id,
                relationshipStatus: "blocked",
                status: "Blocked",
              });
            } else if (blocked_id === currentUserId) {
              friendStore.removeFriend(blocker_id);
            }
            return;
          }

          if (receivedMessage.UnblockUser && currentUserId) {
            const { unblocker_id, unblocked_id } = receivedMessage.UnblockUser;
            if (unblocker_id === currentUserId) {
              friendStore.removeFriend(unblocked_id);
            } else if (unblocked_id === currentUserId) {
              friendStore.removeFriend(unblocker_id);
            }
            return;
          }

          if (receivedMessage.RemoveFriendship && currentUserId) {
            const { remover_id, removed_id } = receivedMessage.RemoveFriendship;
            if (remover_id === currentUserId) {
              friendStore.removeFriend(removed_id);
            } else if (removed_id === currentUserId) {
              friendStore.removeFriend(remover_id);
            }
            return;
          }

          if (receivedMessage.CreateServer) {
            serverStore.addServer(receivedMessage.CreateServer.server);
            return;
          }

          if (receivedMessage.DeleteServer) {
            serverStore.removeServer(receivedMessage.DeleteServer.server_id);
            return;
          }

          if (receivedMessage.CreateChannel) {
            const { channel } = receivedMessage.CreateChannel;
            if (channel?.server_id) {
              serverStore.addChannelToServer(channel.server_id, channel);
            }
            return;
          }

          if (receivedMessage.DeleteChannel) {
            const { channel_id } = receivedMessage.DeleteChannel;
            const serverState = get(serverStore);
            const hostingServer = serverState.servers.find((server) =>
              (server.channels ?? []).some((channel) => channel.id === channel_id),
            );
            if (hostingServer) {
              serverStore.removeChannelFromServer(hostingServer.id, channel_id);
            }
            return;
          }

          if (receivedMessage.JoinServer) {
            const { server_id, user_id } = receivedMessage.JoinServer;
            if (currentUserId && user_id === currentUserId) {
              void serverStore.initialize();
            } else {
              void serverStore.fetchServerDetails(server_id);
            }
            return;
          }

          if (receivedMessage.SendServerInvite && currentUserId) {
            const { user_id } = receivedMessage.SendServerInvite;
            if (user_id === currentUserId) {
              void serverStore.initialize();
            }
          }
        },
      );

      unlistenHandlers.push(
        unlistenFriends,
        unlistenServers,
        unlistenMessages,
        unlistenPresence,
      );
    }
  };

  const unsubscribeAuth = authStore.subscribe((value) => {
    authState.set(value);
  });

  const unsubscribeUser = userStore.subscribe((value) => {
    currentUser.set(value.me ?? null);
  });

  const unsubscribeAuthState: Unsubscriber = authState.subscribe((state) => {
    if (state.status !== "authenticated") {
      postAuthInitialized.set(false);
      clearUnlistenHandlers();
      chatStore.clearActiveChat();
      serverStore.setActiveServer(null);
      return;
    }

    if (!get(postAuthInitialized)) {
      postAuthInitialized.set(true);
      bootstrapAfterAuthentication().catch((error) =>
        console.error("Post-auth bootstrap failed:", error),
      );
    }
  });

  const unsubscribeActiveServer = serverStore.subscribe(($serverState) => {
    const serverId = $serverState.activeServerId;
    if (!serverId) {
      return;
    }
    const server = $serverState.servers.find((s) => s.id === serverId);
    if (!server || !server.channels || server.channels.length === 0) {
      return;
    }

    const generalChannel = server.channels.find((channel) => channel.name === "general");
    const targetChannelId = generalChannel ? generalChannel.id : server.channels[0].id;

    const chatType = get(activeChatType);
    const chatId = get(activeChatId);
    const selectedChannelId = get(activeServerChannelId);

    const hasValidChannel =
      Boolean(selectedChannelId) &&
      server.channels.some((channel) => channel.id === selectedChannelId);

    if (!hasValidChannel) {
      untrack(() => {
        chatStore.setActiveChat(server.id, "server", targetChannelId);
      });
      return;
    }

    const isServerChat = chatType === "server" && chatId === server.id;

    if (!isServerChat) {
      untrack(() => {
        chatStore.setActiveChat(server.id, "server");
      });
    }
  });

  onMount(() => {
    authStore.bootstrap();
  });

  onDestroy(() => {
    unsubscribeAuth();
    unsubscribeUser();
    unsubscribeAuthState();
    unsubscribeActiveServer();
    clearUnlistenHandlers();
  });

  const allUsers = derived(friendStore, ($friendStore) => [...$friendStore.friends]);

  const currentChat = derived(
    [
      friendStore,
      serverStore,
      activeChatType,
      activeChatId,
      activeChannelId,
      messagesByChatId,
    ],
    ([
      $friendStore,
      $serverStore,
      $activeChatType,
      $activeChatId,
      $activeChannelId,
      $messagesByChatId,
    ]) => {
      if ($activeChatType === "dm") {
        const friend = $friendStore.friends.find((f) => f.id === $activeChatId);
        if (friend) {
          return {
            type: "dm",
            id: friend.id,
            friend,
            messages: $messagesByChatId.get(friend.id) || [],
          } as Chat;
        }
      } else if ($activeChatType === "server") {
        const server = $serverStore.servers.find((s) => s.id === $activeChatId);
        if (server && server.channels) {
          const channel = server.channels.find((c) => c.id === $activeChannelId);
          if (channel) {
            return {
              type: "channel",
              id: channel.id,
              name: channel.name,
              serverId: server.id,
              members: server.members,
              messages: $messagesByChatId.get(channel.id) || [],
            } as Chat;
          }
        }
      }

      return null;
    },
  );

  const isAnySettingsPage = derived(page, ($page) =>
    $page.url.pathname.includes("/settings"),
  );

  const isFriendsOrRootPage = derived(
    [page, serverStore],
    ([$page, $serverStore]) =>
      ($page.url.pathname === "/" || $page.url.pathname.startsWith("/friends")) &&
      !$serverStore.activeServerId,
  );

  const activeTab = derived(page, ($page) => {
    if ($page.url.pathname === "/friends/add") {
      return "AddFriend";
    }

    if ($page.url.pathname === "/friends" || $page.url.pathname === "/") {
      return $page.url.searchParams.get("tab") || "All";
    }

    return "All";
  });

  const pageState: PageState = {
    get friends() {
      return get(friendStore).friends;
    },
    get allUsers() {
      return get(allUsers);
    },
    get currentChat() {
      return get(currentChat);
    },
    openModal,
    closeModal,
    openUserCardModal,
    openDetailedProfileModal,
    messagesByChatId,
  };

  setContext(CREATE_GROUP_CONTEXT_KEY, pageState);

  const friendsLayoutContext: FriendsLayoutContext = {
    get friends() {
      return get(friendStore).friends;
    },
    get activeTab() {
      return get(activeTab);
    },
    get loading() {
      return get(friendStore).loading;
    },
  };

  setContext(FRIENDS_LAYOUT_DATA_CONTEXT_KEY, friendsLayoutContext);

  return {
    authState,
    currentUser,
    currentChat,
    allUsers,
    isAnySettingsPage,
    isFriendsOrRootPage,
    activeTab,
    modal: {
      activeModal,
      modalProps,
    },
    pageState,
    handlers: {
      handleKeydown,
      handleFriendsTabSelect,
      handleFriendsAddClick,
      handleSelectChannel,
      handleSelectDirectMessage,
      openModal,
      closeModal,
      openDetailedProfileModal,
    },
  };
}

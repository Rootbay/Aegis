import { page } from "$app/stores";
import { onDestroy, onMount, untrack } from "svelte";
import { derived, get, writable, type Unsubscriber } from "svelte/store";
import { authStore } from "$lib/features/auth/stores/authStore";
import type { AuthState } from "$lib/features/auth/stores/authStore";
import { userStore } from "$lib/stores/userStore";
import { friendStore } from "$lib/features/friends/stores/friendStore";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import { fileTransferStore } from "$lib/features/chat/stores/fileTransferStore";
import { collaborationStore } from "$lib/features/collaboration/collabDocumentStore";
import {
  activeChannelId,
  activeChatId,
  activeChatType,
  activeServerChannelId,
  chatStore,
  groupChats,
  messagesByChatId,
} from "$lib/features/chat/stores/chatStore";
import { directMessageRoster } from "$lib/features/chat/stores/directMessageRoster";
import { getListen } from "$services/tauri";
import type { User } from "$lib/features/auth/models/User";
import { connectivityStore } from "$lib/stores/connectivityStore";
import { createModalManager } from "./app/modalManager";
import { createAppHandlers } from "./app/handlers";
import { createConnectivityBindings } from "./app/connectivity";
import { createPageState } from "./app/pageState";
import type { AppController } from "./app/types";
import { createPostAuthBootstrap } from "./app/controller/postAuthBootstrap";
import { createCurrentChatStore } from "./app/controller/currentChat";

export type { AppController };
export type {
  AppModalType,
  AppHandlers,
  ModalState,
  PageState,
} from "./app/types";

export function createAppController(): AppController {
  const modalManager = createModalManager();
  const connectivity = createConnectivityBindings();
  const handlers = createAppHandlers(modalManager);

  const authState = writable<AuthState>(get(authStore));
  const currentUser = writable<User | null>(get(userStore).me ?? null);
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

  const runPostAuthBootstrap = createPostAuthBootstrap({
    chatStore,
    friendStore,
    serverStore,
    fileTransferStore,
    collaborationStore,
    userStore,
    getListen,
  });

  const bootstrapAfterAuthentication = async () => {
    clearUnlistenHandlers();
    const handlers = await runPostAuthBootstrap();
    unlistenHandlers = handlers;
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

    const generalChannel = server.channels.find(
      (channel) => channel.name === "general",
    );
    const targetChannelId = generalChannel
      ? generalChannel.id
      : server.channels[0].id;

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
    void connectivityStore.initialize();
    authStore.bootstrap();
  });

  onDestroy(() => {
    unsubscribeAuth();
    unsubscribeUser();
    unsubscribeAuthState();
    unsubscribeActiveServer();
    clearUnlistenHandlers();
    connectivityStore.teardown();
  });

  const allUsers = derived(friendStore, ($friendStore) => [
    ...$friendStore.friends,
  ]);

  const groupChatList = derived(groupChats, ($groupChats) =>
    Array.from($groupChats.values()),
  );

  const currentChat = createCurrentChatStore({
    friendStore,
    serverStore,
    groupChats,
    currentUser,
    activeChatType,
    activeChatId,
    activeChannelId,
    messagesByChatId,
  });

  const isAnySettingsPage = derived(page, ($page) =>
    $page.url.pathname.includes("/settings"),
  );

  const isFriendsOrRootPage = derived(
    [page, serverStore, currentChat],
    ([$page, $serverStore, $currentChat]) =>
      ($page.url.pathname === "/" ||
        $page.url.pathname.startsWith("/friends")) &&
      !$serverStore.activeServerId &&
      !$currentChat,
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

  const { pageState } = createPageState({
    modalManager,
    allUsers,
    groupChats: groupChatList,
    currentChat,
    messages: messagesByChatId,
    activeTab,
  });

  return {
    authState,
    currentUser,
    currentChat,
    allUsers,
    groupChats: groupChatList,
    directMessages: directMessageRoster,
    isAnySettingsPage,
    isFriendsOrRootPage,
    activeTab,
    modal: modalManager.state,
    connectivity,
    pageState,
    handlers,
  };
}

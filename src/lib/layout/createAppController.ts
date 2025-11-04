import { page } from "$app/stores";
import { onDestroy, onMount } from "svelte";
import { derived } from "svelte/store";
import { authStore } from "$lib/features/auth/stores/authStore";
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
import { connectivityStore } from "$lib/stores/connectivityStore";
import { createModalManager } from "./app/modalManager";
import { createAppHandlers } from "./app/handlers";
import { createConnectivityBindings } from "./app/connectivity";
import { createPageState } from "./app/pageState";
import type { AppController } from "./app/types";
import { createPostAuthBootstrap } from "./app/controller/postAuthBootstrap";
import { createCurrentChatStore } from "./app/controller/currentChat";
import { createAuthLifecycle } from "./app/controller/authLifecycle";
import { createServerSelectionController } from "./app/controller/serverSelection";

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

  const runPostAuthBootstrap = createPostAuthBootstrap({
    chatStore,
    friendStore,
    serverStore,
    fileTransferStore,
    collaborationStore,
    userStore,
    getListen,
  });

  const authLifecycle = createAuthLifecycle({
    authStore,
    userStore,
    chatStore,
    serverStore,
    runPostAuthBootstrap,
  });

  const serverSelectionController = createServerSelectionController({
    serverStore,
    chatStore,
    activeChatId,
    activeChatType,
    activeServerChannelId,
  });

  authLifecycle.initialize();
  serverSelectionController.initialize();

  const { authState, currentUser } = authLifecycle;

  const shouldShowInitialSetup = derived(
    [authState, currentUser],
    ([$authState, $currentUser]) =>
      $authState.status !== "authenticated" || !$currentUser,
  );

  onMount(() => {
    void connectivityStore.initialize();
    authStore.bootstrap();
  });

  onDestroy(() => {
    authLifecycle.teardown();
    serverSelectionController.teardown();
    connectivityStore.teardown();
  });

  const allUsers = derived(friendStore, ($friendStore) => [
    ...$friendStore.friends,
  ]);

  const friendsLoading = derived(
    friendStore,
    ($friendStore) => $friendStore.loading,
  );

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
    shouldShowInitialSetup,
    friendsLoading,
    connectivity,
    pageState,
    handlers,
  };
}

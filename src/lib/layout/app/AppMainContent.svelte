<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { chatStore } from "$lib/features/chat/stores/chatStore.svelte";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import NetworkStatusIndicator from "$lib/components/NetworkStatusIndicator.svelte";
  import NavigationHeader from "$lib/components/NavigationHeader.svelte";
  import ActiveChatContent from "./ActiveChatContent.svelte";
  import FriendsContent from "./FriendsContent.svelte";
  import { memberSidebarVisibilityStore } from "$lib/features/chat/stores/memberSidebarVisibilityStore";
  import type { AppController } from "./types";
  import type { Snippet } from "svelte";

  let {
    controller,
    children,
  }: {
    controller: AppController;
    children?: Snippet | null;
  } = $props();

  const {
    currentChat,
    isFriendsOrRootPage,
    handlers,
    activeTab,
    isAnySettingsPage,
    connectivity,
  } = controller;
  const {
    openDetailedProfileModal,
    handleFriendsTabSelect,
    handleFriendsAddClick,
  } = handlers;

  const shouldRenderFriendsView = $derived(
    () => !$isAnySettingsPage && $isFriendsOrRootPage,
  );

  const LG_BREAKPOINT = 1024;
  let isLgViewport = $state(true);

  function updateViewportMatch() {
    if (typeof window === "undefined") {
      return;
    }
    isLgViewport = window.innerWidth >= LG_BREAKPOINT;
  }

  onMount(() => {
    updateViewportMatch();
    const handler = () => updateViewportMatch();
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("resize", handler);
    };
  });

  const mobileMemberPanelOpen = $derived(() => {
    const chat = $currentChat;
    if (!chat) return false;
    return $memberSidebarVisibilityStore.get(chat.id) ?? false;
  });

  const canShowMembers = $derived(() => {
    const chat = $currentChat;
    return chat && chat.type !== "dm";
  });

  function handleToggleMemberPanel() {
    const chat = $currentChat;
    if (!chat) return;
    memberSidebarVisibilityStore.toggleVisibility(chat.id);
  }

  function decodeSegment(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    try {
      return decodeURIComponent(value);
    } catch (error) {
      console.warn("Failed to decode chat segment", value, error);
      return value;
    }
  }

  $effect(() => {
    const pathname = $page.url.pathname;
    const dmMatch = /^\/dm\/([^/]+)/.exec(pathname);
    if (dmMatch) {
      const chatId = decodeSegment(dmMatch[1]);
      if (chatId) {
        serverStore.setActiveServer(null);
        if ($currentChat?.type !== "dm" || $currentChat.id !== chatId) {
          void chatStore.setActiveChat(chatId, "dm");
        }
      }
      return;
    }
    const groupMatch = /^\/groups\/([^/]+)/.exec(pathname);
    if (groupMatch) {
      const chatId = decodeSegment(groupMatch[1]);
      if (chatId) {
        serverStore.setActiveServer(null);
        if ($currentChat?.type !== "group" || $currentChat.id !== chatId) {
          void chatStore.setActiveChat(chatId, "group");
        }
      }
      return;
    }

    if (pathname.startsWith("/channels")) {
      return;
    }

    chatStore.clearActiveChat();
  });
</script>

<main class="flex-1 min-h-0 flex flex-col overflow-hidden">
  {#if !$isAnySettingsPage}
    <NavigationHeader
      chat={$currentChat}
      onOpenDetailedProfile={openDetailedProfileModal}
      isFriendsOrRootPage={shouldRenderFriendsView()}
      friendsActiveTab={$activeTab}
      onFriendsTabSelect={handleFriendsTabSelect}
      onFriendsAddClick={handleFriendsAddClick}
      showMemberPanelToggle={!isLgViewport && canShowMembers()}
      mobileMemberPanelOpen={mobileMemberPanelOpen()}
      onToggleMemberPanel={handleToggleMemberPanel}
    />
  {/if}
  {#if $isAnySettingsPage}
    {#if children}
      {@render children()}
    {/if}
  {:else if shouldRenderFriendsView()}
    <FriendsContent
      chat={$currentChat}
      {openDetailedProfileModal}
      friendsActiveTab={$activeTab}
      onFriendsTabSelect={handleFriendsTabSelect}
      onFriendsAddClick={handleFriendsAddClick}
      {children}
    />
  {:else if $currentChat}
    <ActiveChatContent chat={$currentChat} {openDetailedProfileModal} />
  {:else if children}
    <div class="flex-1 min-h-0 flex flex-col">
      {@render children()}
    </div>
  {/if}
</main>

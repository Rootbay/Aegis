<svelte:options runes={true} />

<script lang="ts">
  import { page } from "$app/stores";
  import { chatStore } from "$lib/features/chat/stores/chatStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import ActiveChatContent from "./ActiveChatContent.svelte";
  import FriendsContent from "./FriendsContent.svelte";
  import type { AppController } from "./types";
  import type { Snippet } from "svelte";

  let {
    controller,
    children,
  }: {
    controller: AppController;
    children?: Snippet | null;
  } = $props();

  const { currentChat, isFriendsOrRootPage, handlers, activeTab } = controller;
  const {
    openDetailedProfileModal,
    handleFriendsTabSelect,
    handleFriendsAddClick,
  } = handlers;

  const shouldRenderFriendsView = $derived(() => $isFriendsOrRootPage);

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
    }
  });
</script>

<main class="flex-1 min-h-0 flex flex-col">
  {#if shouldRenderFriendsView()}
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
    {@render children()}
  {/if}
</main>

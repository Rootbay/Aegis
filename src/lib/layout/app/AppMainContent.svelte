<svelte:options runes={true} />

<script lang="ts">
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
</script>

<main class="flex-1 min-h-0 flex flex-col">
  {#if shouldRenderFriendsView()}
    <FriendsContent
      chat={$currentChat}
      openDetailedProfileModal={openDetailedProfileModal}
      friendsActiveTab={$activeTab}
      onFriendsTabSelect={handleFriendsTabSelect}
      onFriendsAddClick={handleFriendsAddClick}
      {children}
    />
  {:else if $currentChat}
    <ActiveChatContent
      chat={$currentChat}
      openDetailedProfileModal={openDetailedProfileModal}
    />
  {:else}
    {#if children}
      {@render children()}
    {/if}
  {/if}
</main>

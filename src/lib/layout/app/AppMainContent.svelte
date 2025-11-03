<svelte:options runes={true} />

<script lang="ts">
  import NavigationHeader from "$lib/components/NavigationHeader.svelte";
  import { ChatView } from "$features/chat";
  import SearchSidebar from "$lib/components/sidebars/SearchSidebar.svelte";
  import MemberSidebar from "$lib/components/sidebars/MemberSidebar.svelte";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
  import { memberSidebarVisibilityStore } from "$lib/features/chat/stores/memberSidebarVisibilityStore";
  import type { AppController } from "./types";
  import type { User } from "$lib/features/auth/models/User";

  type MemberWithRoles = User & Record<string, unknown>;

  let {
    controller,
    children,
  }: {
    controller: AppController;
    children: () => unknown;
  } = $props();

  const { currentChat, isFriendsOrRootPage, handlers, activeTab } = controller;
  const {
    openDetailedProfileModal,
    handleFriendsTabSelect,
    handleFriendsAddClick,
  } = handlers;

  const shouldShowMemberSidebar = $derived(() =>
    $currentChat
      ? $memberSidebarVisibilityStore.get($currentChat.id) !== false
      : false,
  );
</script>

<main class="flex-1 min-h-0 flex flex-col">
  {#if $isFriendsOrRootPage}
    <NavigationHeader
      chat={$currentChat}
      onOpenDetailedProfile={openDetailedProfileModal}
      isFriendsOrRootPage={true}
      friendsActiveTab={$activeTab}
      onFriendsTabSelect={handleFriendsTabSelect}
      onFriendsAddClick={handleFriendsAddClick}
    />
    {@render children()}
  {:else if $currentChat}
    <div class="flex flex-1 min-h-0 flex-col">
      <NavigationHeader
        chat={$currentChat}
        onOpenDetailedProfile={openDetailedProfileModal}
      />

      <div class="flex flex-1 min-h-0">
        <div class="flex flex-1 flex-col min-w-0">
          <ChatView chat={$currentChat} />
        </div>
        {#if $chatSearchStore.searching}
          <SearchSidebar chat={$currentChat} />
        {:else if shouldShowMemberSidebar() && $currentChat.type === "channel"}
          <MemberSidebar
            members={$currentChat.members as MemberWithRoles[]}
            {openDetailedProfileModal}
          />
        {:else if shouldShowMemberSidebar() && $currentChat.type === "group"}
          <MemberSidebar
            members={$currentChat.members as MemberWithRoles[]}
            {openDetailedProfileModal}
            context="group"
            groupId={$currentChat.id}
            groupOwnerId={$currentChat.ownerId}
          />
        {/if}
      </div>
    </div>
  {:else}
    {@render children()}
  {/if}
</main>

<svelte:options runes={true} />

<script lang="ts">
  import "../app.css";
  import { getContext } from "svelte";
  import { theme } from "$lib/stores/theme";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
  import InitialSetup from "$lib/features/auth/components/auth/InitialSetup.svelte";
  import LoadingOverlay from "$lib/components/LoadingOverlay.svelte";
  import Sidebar from "$lib/components/sidebars/Sidebar.svelte";
  import ServerSidebar from "$lib/components/sidebars/ServerSidebar.svelte";
  import MemberSidebar from "$lib/components/sidebars/MemberSidebar.svelte";
  import SearchSidebar from "$lib/components/sidebars/SearchSidebar.svelte";
  import DirectMessageList from "$lib/components/lists/DirectMessageList.svelte";
  import NavigationHeader from "$lib/components/NavigationHeader.svelte";
  import AppModals from "$lib/layout/AppModals.svelte";
  import { ChatView } from "$features/chat";
  import { createAppController } from "$lib/layout/createAppController";
  import { FRIENDS_LAYOUT_DATA_CONTEXT_KEY } from "$lib/contextKeys";
  import type { FriendsLayoutContext } from "$lib/contextTypes";
  import type { User } from "$lib/features/auth/models/User";

  type MemberWithRoles = User & Record<string, unknown>;

  let { children } = $props();

  const appController = createAppController();

  const {
    authState,
    currentUser,
    currentChat,
    allUsers,
    groupChats,
    isAnySettingsPage,
    isFriendsOrRootPage,
    activeTab,
    modal,
    handlers,
  } = appController;

  const friendsLayoutContext =
    getContext<FriendsLayoutContext | undefined>(
      FRIENDS_LAYOUT_DATA_CONTEXT_KEY,
    );

  const friendsLoading = $derived(
    () => friendsLayoutContext?.loading ?? false,
  );

  const {
    handleKeydown,
    handleFriendsTabSelect,
    handleFriendsAddClick,
    handleSelectChannel,
    handleSelectDirectMessage,
    openModal,
    closeModal,
    openDetailedProfileModal,
  } = handlers;

  const { activeModal, modalProps } = modal;

  $effect(() => {
    if ($theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="flex h-screen bg-base-100 text-foreground"
  data-friends-loading={friendsLoading ? "true" : undefined}
>
  <LoadingOverlay show={$authState.loading} />
  {#if $authState.status !== "authenticated" || !$currentUser}
    <InitialSetup />
  {:else}
    {#if !$isAnySettingsPage}
      <Sidebar
        onCreateJoinServerClick={() => openModal("serverManagement")}
        {openDetailedProfileModal}
      />
    {/if}
    {#if !$isAnySettingsPage}
      {#if $serverStore.activeServerId}
        <ServerSidebar
          server={$serverStore.servers.find(
            (s) => s.id === $serverStore.activeServerId,
          )!}
          onSelectChannel={handleSelectChannel}
        />
      {:else}
        <DirectMessageList
          friends={$allUsers}
          groupChats={$groupChats}
          activeFriendId={
            $currentChat &&
            ($currentChat.type === "dm" || $currentChat.type === "group")
              ? $currentChat.id
              : null
          }
          onSelect={handleSelectDirectMessage}
          onCreateGroupClick={() => openModal("createGroup")}
        />
      {/if}
    {/if}
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
      {:else if $serverStore.activeServerId}
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
              <SearchSidebar />
            {:else}
              <MemberSidebar
                members={$currentChat?.type === "channel"
                  ? ($currentChat.members as MemberWithRoles[])
                  : []}
                {openDetailedProfileModal}
              />
            {/if}
          </div>
        </div>
      {:else}
        {@render children()}
      {/if}
    </main>
  {/if}
</div>

<AppModals
  activeModal={$activeModal}
  modalProps={$modalProps}
  allUsers={$allUsers}
  {closeModal}
/>

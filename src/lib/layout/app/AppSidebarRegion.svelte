<svelte:options runes={true} />

<script lang="ts">
  import Sidebar from "$lib/components/sidebars/Sidebar.svelte";
  import ServerSidebar from "$lib/components/sidebars/ServerSidebar.svelte";
  import DirectMessageList from "$lib/components/lists/DirectMessageList.svelte";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import type { AppController } from "./types";

  let { controller }: { controller: AppController } = $props();

  const { handlers, isAnySettingsPage, directMessages, currentChat } =
    controller;
  const {
    openModal,
    openDetailedProfileModal,
    handleSelectChannel,
    handleSelectDirectMessage,
  } = handlers;

  const activeServer = $derived(() => {
    const activeServerId = $serverStore.activeServerId;
    if (!activeServerId) {
      return null;
    }
    return (
      $serverStore.servers.find((server) => server.id === activeServerId) ??
      null
    );
  });

  const activeDirectMessageId = $derived(() => {
    const chat = $currentChat;
    if (!chat) {
      return null;
    }
    return chat.type === "dm" || chat.type === "group" ? chat.id : null;
  });
</script>

{#if !$isAnySettingsPage}
  <Sidebar
    onCreateJoinServerClick={() => openModal("serverManagement")}
    {openDetailedProfileModal}
  />
{/if}

{#if !$isAnySettingsPage}
  {#if activeServer()}
    <ServerSidebar
      server={activeServer()!}
      onSelectChannel={handleSelectChannel}
    />
  {:else}
    <DirectMessageList
      entries={$directMessages}
      activeChatId={activeDirectMessageId()}
      onSelect={handleSelectDirectMessage}
      onCreateGroupClick={() => openModal("createGroup")}
    />
  {/if}
{/if}

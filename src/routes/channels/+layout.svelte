<script lang="ts">
  import ServerSidebar from "$lib/components/sidebars/ServerSidebar.svelte";
  import MemberSidebar from "$lib/components/sidebars/MemberSidebar.svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { toasts } from "$lib/stores/ToastStore";
  import { setContext, getContext } from "svelte";
  import {
    SERVER_LAYOUT_DATA_CONTEXT_KEY,
    CREATE_GROUP_CONTEXT_KEY,
  } from "$lib/contextKeys";
  import type { CreateGroupContext, ServerLayoutContext } from "$lib/contextTypes";
  import { createServerLayoutController } from "$lib/layout/server/createServerLayoutController";

  let { children } = $props();

  const createGroupContext = getContext<CreateGroupContext>(
    CREATE_GROUP_CONTEXT_KEY,
  );
  const { openUserCardModal } = createGroupContext;

  const controller = createServerLayoutController({
    navigate: (value) => goto(value),
    notifyError: (message) => toasts.addToast(message, "error"),
  });

  setContext<ServerLayoutContext>(
    SERVER_LAYOUT_DATA_CONTEXT_KEY,
    controller.context,
  );

  const serverStore = controller.server;
  const membersStore = controller.members;
  const loadingStore = controller.loading;
  const hasServerStore = controller.hasServer;
  const serverIdStore = controller.serverId;

  const showSidebars = $derived(!$page.url.pathname.includes("/settings"));

  $effect(() => {
    const activeServerId = $page.params.serverId ?? null;
    if (activeServerId === $serverIdStore) {
      return;
    }
    controller.setActiveServerId(activeServerId);
  });
</script>

<div class="flex h-full w-full">
  {#if $loadingStore}
    <p class="text-muted-foreground text-center mt-8">Loading server data...</p>
  {:else if $hasServerStore && $serverStore}
    {#if showSidebars}
      <ServerSidebar
        server={$serverStore}
        onSelectChannel={controller.handleSelectChannel}
        refreshServerData={controller.refresh}
      />
    {/if}
    <main class="grow flex flex-col bg-muted">
      {@render children()}
    </main>
    {#if showSidebars}
      <MemberSidebar
        members={$membersStore}
        openUserCardModal={openUserCardModal}
      />
    {/if}
  {:else}
    <p class="text-muted-foreground text-center mt-8">
      Server not found or an error occurred.
    </p>
  {/if}
</div>

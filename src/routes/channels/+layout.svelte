<script lang="ts">
  import ServerSidebar from "$lib/components/sidebars/ServerSidebar.svelte";
  import MemberSidebar from "$lib/components/sidebars/MemberSidebar.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { toasts } from "$lib/stores/ToastStore";
  import { setContext, getContext } from "svelte";
  import {
    SERVER_LAYOUT_DATA_CONTEXT_KEY,
    CREATE_GROUP_CONTEXT_KEY,
  } from "$lib/contextKeys";
  import type { CreateGroupContext, ServerLayoutContext } from "$lib/contextTypes";
  import { createServerLayoutController } from "$lib/layout/server/createServerLayoutController";
  import { Skeleton } from "$lib/components/ui/skeleton";

  let { children } = $props();

  const createGroupContext = getContext<CreateGroupContext>(
    CREATE_GROUP_CONTEXT_KEY,
  );
  const { openUserCardModal } = createGroupContext;

  const controller = createServerLayoutController({
    // eslint-disable-next-line svelte/no-navigation-without-resolve
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

  const showSidebars = $derived(!page.url.pathname.includes("/settings"));
  const skeletonRows = [0, 1, 2, 3, 4];

  $effect(() => {
    const activeServerId = page.params.serverId ?? null;
    if (activeServerId === $serverIdStore) {
      return;
    }
    controller.setActiveServerId(activeServerId);
  });
</script>

<div class="flex h-full w-full">
  {#if $loadingStore}
    <div class="flex h-full w-full gap-4">
      {#if showSidebars}
        <div class="flex w-60 flex-col gap-3">
          <Skeleton class="h-10 w-full rounded-2xl" aria-hidden="true" />
          <div class="space-y-2">
            {#each skeletonRows as item (item)}
              <Skeleton class="h-3 w-full rounded-full" aria-hidden="true" />
            {/each}
          </div>
        </div>
      {/if}
      <main class="grow flex flex-col gap-4 rounded-3xl bg-muted p-4">
        <div class="flex gap-3">
          <Skeleton class="h-12 w-32 rounded-2xl" aria-hidden="true" />
          <Skeleton class="h-12 w-32 rounded-2xl" aria-hidden="true" />
        </div>
        <div class="flex grow gap-3">
          <Skeleton class="grow rounded-3xl" aria-hidden="true" />
        </div>
      </main>
      {#if showSidebars}
        <div class="flex w-64 flex-col gap-3">
          <Skeleton class="h-10 w-full rounded-2xl" aria-hidden="true" />
          <div class="space-y-2">
            {#each skeletonRows as item (item)}
              <Skeleton class="h-3 w-full rounded-full" aria-hidden="true" />
            {/each}
          </div>
        </div>
      {/if}
    </div>
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
  {/if}
</div>

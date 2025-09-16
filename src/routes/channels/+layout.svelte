<script lang="ts">
  import ServerSidebar from "$lib/components/sidebars/ServerSidebar.svelte";
  import MemberSidebar from "$lib/components/sidebars/MemberSidebar.svelte";
  import { page } from "$app/stores";
  import { invoke } from "@tauri-apps/api/core";
  import { toasts } from "$lib/data/stores/ToastStore";
  import { goto } from '$app/navigation';
  import { setContext, getContext } from "svelte";
  import { SERVER_LAYOUT_DATA_CONTEXT_KEY, CREATE_GROUP_CONTEXT_KEY } from "$lib/data/contextKeys";
  import type { CreateGroupContext } from '$lib/data/contextTypes';

  let serverId = $state<string | null>(null);
  let server = $state<any>(null);
  let channels = $state<any[]>([]);
  let members = $state<any[]>([]);
  let loading = $state(true);

  const { openUserCardModal } = getContext<CreateGroupContext>(CREATE_GROUP_CONTEXT_KEY);

  function handleSelectChannel(serverId: string, channelId: string) {
    (goto as unknown as (target: string) => void)(`/channels/${serverId}/${channelId}`);
  }

  $effect(() => {
    if ($page.params.serverId) {
      serverId = $page.params.serverId;
      fetchServerData(serverId);
    }
  });

  async function fetchServerData(id: string) {
    loading = true;
    try {
      const fetchedServer = await invoke("get_server_details", { serverId: id });
      const fetchedChannels = await invoke("get_channels_for_server", { serverId: id }) as any[];
      const fetchedMembers = await invoke("get_members_for_server", { serverId: id }) as any[];
      server = fetchedServer ? { ...fetchedServer, channels: fetchedChannels, members: fetchedMembers } : null;
      channels = fetchedChannels;
      members = fetchedMembers;
    } catch (error) {
      console.error("Failed to fetch server data:", error);
      const message = error instanceof Error ? error.message : 'Failed to load server data.';
      toasts.addToast(message, "error");
      server = null;
      channels = [];
      members = [];
    } finally {
      loading = false;
    }
  }

  setContext(SERVER_LAYOUT_DATA_CONTEXT_KEY, {
    server: () => server,
    channels: () => channels,
    members: () => members,
  });
</script>

<div class="flex h-full w-full">
  {#if loading}
    <p class="text-muted-foreground text-center mt-8">Loading server data...</p>
  {:else if server}
    {#if !$page.url.pathname.includes('/settings')}
      <ServerSidebar {server} onSelectChannel={handleSelectChannel} />
    {/if}
    <main class="flex-grow flex flex-col bg-muted">
      <slot />
    </main>
    {#if !$page.url.pathname.includes('/settings')}
      <MemberSidebar {members} {openUserCardModal} />
    {/if}
  {:else}
    <p class="text-muted-foreground text-center mt-8">Server not found or an error occurred.</p>
  {/if}
</div>

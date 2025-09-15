<script lang="ts">
  import ServerSidebar from "$lib/components/sidebars/ServerSidebar.svelte";
  import MemberSidebar from "$lib/components/sidebars/MemberSidebar.svelte";
  import { page } from "$app/stores";
  import { invoke } from "@tauri-apps/api/core";
  import { toasts } from "$lib/data/stores/ToastStore";
  import { setContext } from "svelte";
  import { SERVER_LAYOUT_DATA_CONTEXT_KEY } from "$lib/data/contextKeys";

  let serverId: string | null = null;
  let server: any = null;
  let channels: any[] = [];
  let members: any[] = [];
  let loading = true;

  $: if ($page.params.serverId) {
    serverId = $page.params.serverId;
    fetchServerData(serverId);
  }

  async function fetchServerData(id: string) {
    loading = true;
    try {
      const fetchedServer = await invoke("get_server_details", { serverId: id });
      server = fetchedServer;

      const fetchedChannels = await invoke("get_channels_for_server", { serverId: id });
      channels = fetchedChannels;

      const fetchedMembers = await invoke("get_members_for_server", { serverId: id });
      members = fetchedMembers;
    } catch (error) {
      console.error("Failed to fetch server data:", error);
      toasts.addToast(error.message || "Failed to load server data.", "error");
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
      <ServerSidebar {server} {channels} />
    {/if}
    <main class="flex-grow flex flex-col bg-muted">
      <slot />
    </main>
    {#if !$page.url.pathname.includes('/settings')}
      <MemberSidebar {members} />
    {/if}
  {:else}
    <p class="text-muted-foreground text-center mt-8">Server not found or an error occurred.</p>
  {/if}
</div>

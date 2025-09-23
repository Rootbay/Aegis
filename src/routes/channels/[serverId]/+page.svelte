<script lang="ts">
  import { page } from "$app/stores";
  import { invoke } from "@tauri-apps/api/core";
  import { toasts } from "$lib/stores/ToastStore";
  import { ChatView } from "$features/chat";
  import type { Channel } from "$lib/features/channels/models/Channel";
  import type { ChannelChat } from "$lib/features/chat/models/Chat";

  let serverId = $state<string | null>(null);
  let channels = $state<ChannelChat[]>([]);
  let selectedChannel = $state<ChannelChat | null>(null);
  let loading = $state(true);

  $effect(() => {
    const params = $page.params;
    const nextServerId = params.serverId ?? null;
    if (nextServerId && nextServerId !== serverId) {
      serverId = nextServerId;
      fetchChannels(nextServerId);
    }
  });

  async function fetchChannels(id: string) {
    loading = true;
    try {
      const fetchedChannels = await invoke<Channel[]>(
        "get_channels_for_server",
        { serverId: id, server_id: id },
      );
      channels = fetchedChannels
        .filter((channel) => channel.channel_type === "text")
        .map((channel) => ({
          type: "channel",
          id: channel.id,
          name: channel.name,
          serverId: channel.server_id,
          members: [],
          messages: [],
        }));
      selectedChannel = channels[0] ?? null;
    } catch (error) {
      console.error("Failed to fetch channels:", error);
      const message =
        error instanceof Error ? error.message : "Failed to load channels.";
      toasts.addToast(message, "error");
      selectedChannel = null;
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex flex-col h-full w-full">
  {#if loading}
    <p class="text-muted-foreground text-center mt-8">Loading channels...</p>
  {:else if selectedChannel}
    <ChatView chat={selectedChannel} />
  {:else}
    <p class="text-muted-foreground text-center mt-8">
      Either you do not have permission to any text channels or there are none
      in this server.
    </p>
  {/if}
</div>

<script lang="ts">
  import { page } from '$app/stores';
  import { invoke } from '@tauri-apps/api/core';
  import { toasts } from '$lib/data/stores/ToastStore';
  import { ChatView } from '$features/chat';

  let serverId: string;
  let channels: any[] = [];
  let selectedChannel: any = null;
  let loading = true;

  $: if ($page.params.serverId) {
    serverId = $page.params.serverId;
    fetchChannels(serverId);
  }

  async function fetchChannels(id: string) {
    loading = true;
    try {
      const fetchedChannels = await invoke('get_channels_for_server', { serverId: id });
      channels = fetchedChannels;
      if (channels.length > 0) {
        selectedChannel = channels[0];
      } else {
        selectedChannel = null;
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error);
      toasts.addToast(error.message || 'Failed to load channels.', 'error');
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
    <ChatView channel={selectedChannel} />
  {:else}
    <p class="text-muted-foreground text-center mt-8">
      Either you do not have permission to any text channels or there are none in this server.
    </p>
  {/if}
</div>

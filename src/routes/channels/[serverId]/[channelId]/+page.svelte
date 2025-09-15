<script lang="ts">
  import { ChatView } from '$features/chat';
  import { chatStore, activeChatId, activeChatType, activeChannelId, messagesByChatId } from '$lib/data/stores/chatStore';
  import { serverStore } from '$lib/data/stores/serverStore';
  import { page } from '$app/stores';

  const currentServerId = $derived($page.params.serverId);
  const currentChannelId = $derived($page.params.channelId);

  let currentChat = $derived.by(() => {
    if ($activeChatType === 'server') {
      const server = $serverStore.servers.find(s => s.id === $activeChatId);
      if (server && server.channels) {
        const channel = server.channels.find(c => c.id === $activeChannelId);
        if (channel) {
          return {
            type: 'channel',
            id: channel.id,
            name: channel.name,
            serverId: server.id,
            members: server.members,
            messages: $messagesByChatId.get(channel.id) || []
          };
        }
      }
    }
    return null;
  });

  $effect(() => {
    if (currentServerId && currentChannelId) {
      chatStore.setActiveChat(currentServerId, 'server', currentChannelId);
    }
  });
</script>

{#if currentChat}
  <ChatView chat={currentChat} class="flex-grow min-w-0" />
{:else}
  <div class="flex-grow min-w-0 flex items-center justify-center bg-card">
    <div class="flex flex-col items-center justify-center text-zinc-500">
      <p class="text-lg mt-4">
        Loading channel...
      </p>
    </div>
  </div>
{/if}

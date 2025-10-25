<svelte:options runes={true} />

<script lang="ts">
  import { ChatView } from "$features/chat";
  import {
    chatStore,
    activeChatId,
    activeChatType,
    activeServerChannelId,
    messagesByChatId,
  } from "$lib/features/chat/stores/chatStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { page } from "$app/stores";
  import type { ChannelChat } from "$lib/features/chat/models/Chat";
  import type { Message } from "$lib/features/chat/models/Message";

  const currentServerId = $derived($page.params.serverId);
  const currentChannelId = $derived($page.params.channelId);

  const currentChat = $derived.by<ChannelChat | null>(() => {
    if ($activeChatType === "server") {
      const server = $serverStore.servers.find((s) => s.id === $activeChatId);
      if (server && server.channels) {
        const channel = server.channels.find((c) => c.id === $activeServerChannelId);
        if (channel) {
          const messages =
            ($messagesByChatId.get(channel.id) as Message[] | undefined) ?? [];
          return {
            type: "channel",
            id: channel.id,
            name: channel.name,
            serverId: server.id,
            members: server.members,
            messages,
          } satisfies ChannelChat;
        }
      }
    }
    return null;
  });

  $effect(() => {
    if (currentServerId && currentChannelId) {
      chatStore.setActiveChat(currentServerId, "server", currentChannelId);
    }
  });
</script>

{#if currentChat}
  <div class="flex-grow min-w-0">
    <ChatView chat={currentChat} />
  </div>
{:else}
  <div class="flex-grow min-w-0 flex items-center justify-center bg-card">
    <div class="flex flex-col items-center justify-center text-zinc-500">
      <p class="text-lg mt-4">Loading channel...</p>
    </div>
  </div>
{/if}

<svelte:options runes={true} />

<script lang="ts">
  import { page } from "$app/stores";
  import { ChatView } from "$features/chat";
  import {
    chatStore,
    activeChatId,
    activeChatType,
    activeServerChannelId,
    messagesByChatId,
  } from "$lib/features/chat/stores/chatStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import type { ChannelChat } from "$lib/features/chat/models/Chat";
  import type { Message } from "$lib/features/chat/models/Message";

  const currentServerId = $derived($page.params.serverId);

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
            topic: channel.topic ?? null,
            members: server.members,
            messages,
          } satisfies ChannelChat;
        }
      }
    }
    return null;
  });

  const hasTextChannels = $derived(() => {
    if (!currentServerId) {
      return null;
    }
    const server = $serverStore.servers.find((candidate) => candidate.id === currentServerId);
    if (!server || !server.channels) {
      return null;
    }
    return server.channels.some((channel) => channel.channel_type === "text");
  });

  let lastActivatedServerId: string | null = null;
  let lastActivatedChannelId: string | null = null;

  $effect(() => {
    const serverId = currentServerId;
    if (!serverId) {
      lastActivatedServerId = null;
      lastActivatedChannelId = null;
      return;
    }

    const server = $serverStore.servers.find((candidate) => candidate.id === serverId);
    const channels = server?.channels ?? [];
    const textChannels = channels.filter((channel) => channel.channel_type === "text");

    if (textChannels.length === 0) {
      lastActivatedServerId = null;
      lastActivatedChannelId = null;
      return;
    }

    let targetChannelId = $activeServerChannelId;
    if (!targetChannelId || !textChannels.some((channel) => channel.id === targetChannelId)) {
      const generalChannel = textChannels.find((channel) => channel.name === "general");
      targetChannelId = generalChannel?.id ?? textChannels[0]?.id ?? null;
    }

    if (!targetChannelId) {
      lastActivatedServerId = null;
      lastActivatedChannelId = null;
      return;
    }

    const alreadyActivated =
      lastActivatedServerId === serverId && lastActivatedChannelId === targetChannelId;

    if (alreadyActivated) {
      return;
    }

    lastActivatedServerId = serverId;
    lastActivatedChannelId = targetChannelId;
    void chatStore.setActiveChat(serverId, "server", targetChannelId);
  });
</script>

{#if currentChat}
  <div class="grow min-w-0">
    <ChatView chat={currentChat} />
  </div>
{:else if hasTextChannels === false}
  <div class="flex flex-col h-full w-full items-center justify-center bg-card">
    <p class="text-muted-foreground text-center mt-4">
      Either you do not have permission to any text channels or there are none in this
      server.
    </p>
  </div>
{:else}
  <div class="grow min-w-0 flex items-center justify-center bg-card">
    <div class="flex flex-col items-center justify-center text-zinc-500">
      <p class="text-lg mt-4">Loading channel...</p>
    </div>
  </div>
{/if}

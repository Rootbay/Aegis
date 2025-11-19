<svelte:options runes={true} />

<script lang="ts">
  import { onDestroy } from "svelte";
  import { page } from "$app/stores";
  import { chatStore } from "$lib/features/chat/stores/chatStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";

  $effect(() => {
    const chatId = $page.params.chatId ?? null;
    serverStore.setActiveServer(null);
    if (chatId) {
      void chatStore.setActiveChat(chatId, "dm");
    } else {
      chatStore.clearActiveChat();
    }
  });

  onDestroy(() => {
    chatStore.clearActiveChat();
  });
</script>

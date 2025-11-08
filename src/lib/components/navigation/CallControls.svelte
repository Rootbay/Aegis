<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";
  import { Phone, Video } from "@lucide/svelte";
  import { callStore } from "$lib/features/calls/stores/callStore";
  import type { Chat } from "$lib/features/chat/models/Chat";

  let { chat } = $props<{ chat: Chat | null }>();

  onMount(() => {
    callStore.initialize();
  });

  let activeCallForChat = $derived.by(() => {
    if (!chat?.id) return null;
    const active = $callStore.activeCall;
    return active && active.chatId === chat.id && active.chatType === chat.type
      ? active
      : null;
  });

  const isCallEligible = $derived.by(() => {
    if (!chat) {
      return false;
    }
    return (
      chat.type === "dm" || chat.type === "group" || chat.type === "channel"
    );
  });

  const voiceButtonDisabled = $derived.by(() => {
    if (!chat?.id || !isCallEligible) return true;
    const state = $callStore;
    const active = state.activeCall;
    if (
      active &&
      (active.chatId !== chat.id || active.chatType !== chat.type) &&
      active.status !== "ended" &&
      active.status !== "error"
    ) {
      return true;
    }
    if (!state.deviceAvailability.audioInput) {
      return true;
    }
    if (state.permissions.audio === "denied") {
      return true;
    }
    if (state.permissions.checking) {
      return true;
    }
    return false;
  });

  const videoButtonDisabled = $derived.by(() => {
    if (!chat?.id || !isCallEligible) return true;
    const state = $callStore;
    const active = state.activeCall;
    if (
      active &&
      (active.chatId !== chat.id || active.chatType !== chat.type) &&
      active.status !== "ended" &&
      active.status !== "error"
    ) {
      return true;
    }
    if (
      !state.deviceAvailability.audioInput ||
      !state.deviceAvailability.videoInput
    ) {
      return true;
    }
    if (
      state.permissions.audio === "denied" ||
      state.permissions.video === "denied"
    ) {
      return true;
    }
    if (state.permissions.checking) {
      return true;
    }
    return false;
  });

  const voiceCallActive = $derived(
    Boolean(
      activeCallForChat &&
        activeCallForChat.type === "voice" &&
        activeCallForChat.status !== "ended" &&
        activeCallForChat.status !== "error",
    ),
  );

  const videoCallActive = $derived(
    Boolean(
      activeCallForChat &&
        activeCallForChat.type === "video" &&
        activeCallForChat.status !== "ended" &&
        activeCallForChat.status !== "error",
    ),
  );

  function getCallMembers() {
    if (!chat) return [] as { id: string; name?: string }[];
    if (chat.type === "dm") {
      const name = resolveUserName(chat.friend);
      return [
        {
          id: chat.friend.id,
          name,
        },
      ];
    }
    if (chat.type === "group" || chat.type === "channel") {
      return chat.members.map(
        (member: { id: string; name?: string | null }) => ({
          id: member.id,
          name: resolveUserName(member),
        }),
      );
    }
    return [];
  }

  function getChatDisplayName() {
    if (!chat) return "";
    if (chat.type === "dm") {
      return resolveUserName(chat.friend);
    }
    return chat.name;
  }

  function resolveUserName(user: { id: string; name?: string | null }) {
    const nameValue = user.name ?? "";
    const trimmed = typeof nameValue === "string" ? nameValue.trim() : "";
    if (trimmed.length > 0) {
      return trimmed;
    }
    return `User-${user.id.slice(0, 4) || "anon"}`;
  }

  async function startVoiceCall() {
    if (!chat || !isCallEligible) return;
    const active = $callStore.activeCall;
    if (
      active &&
      active.chatId === chat.id &&
      active.chatType === chat.type &&
      active.status !== "ended" &&
      active.status !== "error"
    ) {
      callStore.setCallModalOpen(true);
      return;
    }
    await callStore.startCall({
      chatId: chat.id,
      chatName: getChatDisplayName(),
      chatType: chat.type,
      type: "voice",
      serverId: chat.type === "channel" ? chat.serverId : undefined,
      members: getCallMembers(),
    });
  }

  async function startVideoCall() {
    if (!chat || !isCallEligible) return;
    const active = $callStore.activeCall;
    if (
      active &&
      active.chatId === chat.id &&
      active.chatType === chat.type &&
      active.status !== "ended" &&
      active.status !== "error"
    ) {
      callStore.setCallModalOpen(true);
      return;
    }
    await callStore.startCall({
      chatId: chat.id,
      chatName: getChatDisplayName(),
      chatType: chat.type,
      type: "video",
      serverId: chat.type === "channel" ? chat.serverId : undefined,
      members: getCallMembers(),
    });
  }
</script>

{#if isCallEligible}
  <Button
    variant="ghost"
    class={cn("cursor-pointer", voiceCallActive ? "text-cyan-400" : "")}
    size="icon"
    aria-label="Start voice call"
    onclick={startVoiceCall}
    disabled={voiceButtonDisabled}
    aria-pressed={voiceCallActive}
  >
    <Phone class="w-4 h-4" />
  </Button>
  <Button
    variant="ghost"
    class={cn("cursor-pointer", videoCallActive ? "text-cyan-400" : "")}
    size="icon"
    aria-label="Start video call"
    onclick={startVideoCall}
    disabled={videoButtonDisabled}
    aria-pressed={videoCallActive}
  >
    <Video class="w-4 h-4" />
  </Button>
{/if}
